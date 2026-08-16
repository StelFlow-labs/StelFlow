//! Property tests over the accrual maths.
//!
//! These sweep the timeline rather than asserting a single point, and they are
//! where the invariants `docs/threat-model.md` leans on get exercised — T12's
//! claim that repeated withdrawals cannot extract more than the formula allows
//! is a property, not an example, and deserves testing as one.

use super::*;
use crate::Error;

/// Value conservation across every day of a stream's life, under a mixed
/// sequence of withdrawals and an approval.
///
/// `deposit == withdrawn + refunded + remaining_in_contract`, checked after
/// every state-changing call rather than only at the end.
#[test]
fn value_is_conserved_at_every_step() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    for day in 0..=35u64 {
        h.warp_days(day);
        if day == 17 {
            h.client.approve_milestone(&id, &0);
        }
        if day % 3 == 0 {
            let _ = h.client.try_withdraw(&id);
        }

        let stream = h.client.get_stream(&id);
        assert_eq!(
            TOTAL,
            stream.withdrawn + h.contract_balance(),
            "conservation broke on day {}",
            day,
        );
    }
}

/// T12: repeated withdrawal never extracts more than a single withdrawal would.
///
/// The threat model proves this by telescoping sum; this checks the
/// implementation actually has the property the proof assumes.
#[test]
fn withdrawal_frequency_does_not_change_the_total() {
    let daily = {
        let h = Harness::new();
        let id = h.simple();
        let mut total = 0i128;
        for day in 1..=30u64 {
            h.warp_days(day);
            if let Ok(Ok(paid)) = h.client.try_withdraw(&id) {
                total += paid;
            }
        }
        total
    };

    let once = {
        let h = Harness::new();
        let id = h.simple();
        h.warp_days(30);
        h.client.withdraw(&id)
    };

    assert_eq!(
        daily, once,
        "dust extraction by frequent withdrawal is not possible"
    );
    assert_eq!(daily, TOTAL);
}

/// `streamed_total` is monotonically non-decreasing on a live stream. Nothing a
/// party does may make accrued value un-accrue.
#[test]
fn streamed_total_never_goes_backwards() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    let mut previous = 0i128;
    for day in 0..=40u64 {
        h.warp_days(day);
        if day == 21 {
            h.client.approve_milestone(&id, &0);
        }
        let now = h.client.describe(&id).position.streamed_total;
        assert!(
            now >= previous,
            "streamed_total fell from {} to {} on day {}",
            previous,
            now,
            day,
        );
        previous = now;
    }
}

/// Claimable is never negative, at any point, under any milestone state.
///
/// `docs/milestone-revocation.md` rejected re-locking precisely because it drove
/// this negative. The clamp stays as defence against a bug, not against a
/// reachable state — so this asserts the state really is unreachable.
#[test]
fn claimable_is_never_negative() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    for day in 0..=60u64 {
        h.warp_days(day);
        if day == 12 {
            h.client.approve_milestone(&id, &0);
        }
        if day % 5 == 0 {
            let _ = h.client.try_withdraw(&id);
        }
        assert!(
            h.client.claimable(&id) >= 0,
            "negative claimable on day {}",
            day
        );
    }
}

/// A stream always settles to exactly its deposit, for a spread of totals chosen
/// to divide badly by a 30-day duration.
#[test]
fn every_stream_settles_to_its_exact_deposit() {
    for total in [1i128, 7, 29, 31, 1_000_000_007, TOTAL + 1, TOTAL - 13] {
        let h = Harness::new();
        let id = h.create(total, START, true, h.no_milestones());

        let mut paid = 0i128;
        for day in 1..=30u64 {
            h.warp_days(day);
            if let Ok(Ok(amount)) = h.client.try_withdraw(&id) {
                paid += amount;
            }
        }
        assert_eq!(paid, total, "total {} did not settle exactly", total);
        assert_eq!(h.contract_balance(), 0, "total {} left dust behind", total);
    }
}

/// Cancelling at any point conserves value, whatever has been withdrawn or
/// approved beforehand.
#[test]
fn cancellation_conserves_value_at_any_point() {
    for day in [0u64, 1, 7, 15, 18, 29, 30, 45] {
        let h = Harness::new();
        let id = h.alice_and_bob();

        h.warp_days(day.min(20));
        let _ = h.client.try_withdraw(&id);

        h.warp_days(day);
        let settlement = h.client.cancel(&id);
        let stream = h.client.get_stream(&id);

        assert_eq!(
            TOTAL,
            stream.withdrawn + settlement.refund + h.contract_balance(),
            "cancelling on day {} did not conserve value",
            day,
        );
        assert_eq!(
            h.contract_balance(),
            settlement.recipient_balance,
            "what stays behind must be exactly what the recipient is owed (day {})",
            day,
        );
    }
}

/// A stream whose gate never opens pays the recipient only its base, and returns
/// the tranche to the sender on cancellation — the T3 shape, before deadlines.
#[test]
fn an_abandoned_gate_strands_only_its_own_tranche() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(30);
    assert_eq!(h.client.withdraw(&id), BASE);
    assert_eq!(
        h.contract_balance(),
        GATED,
        "the tranche is stranded, and it is exactly the tranche — nothing more",
    );
    assert_eq!(
        h.client.try_withdraw(&id),
        Err(Ok(Error::NothingToWithdraw))
    );
}
