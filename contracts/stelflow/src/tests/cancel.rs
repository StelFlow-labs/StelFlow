//! `docs/behaviour.md` → Feature: cancel

use soroban_sdk::vec;

use super::*;
use crate::{Error, MilestoneState, OnExpiry};

/// Scenario: happy path — cancel partway through, recipient keeps earned, sender
/// recovers the rest
#[test]
fn recipient_keeps_earned_sender_recovers_the_rest() {
    let h = Harness::new();
    let id = h.simple();

    h.warp_days(10);
    let settlement = h.client.cancel(&id);

    assert_eq!(settlement.refund, TOTAL * 2 / 3, "twenty unstreamed days");
    assert_eq!(settlement.recipient_balance, TOTAL / 3, "ten streamed days");
    assert_eq!(
        h.contract_balance(),
        TOTAL / 3,
        "the recipient's balance stays in the contract, frozen but theirs",
    );
    h.assert_conserved(TOTAL);
}

/// Scenario: withdraw after cancellation pays the frozen earned balance
#[test]
fn the_frozen_balance_is_still_withdrawable_afterwards() {
    let h = Harness::new();
    let id = h.simple();

    h.warp_days(10);
    h.client.cancel(&id);

    h.warp_days(25);
    assert_eq!(
        h.client.withdraw(&id),
        TOTAL / 3,
        "accrual froze at cancellation; the clock moving on adds nothing",
    );
    assert_eq!(h.contract_balance(), 0);
    h.assert_conserved(TOTAL);
}

/// Scenario: cancel with zero elapsed time
#[test]
fn cancelling_before_anything_streams_refunds_everything() {
    let h = Harness::new();
    let id = h.simple();

    let settlement = h.client.cancel(&id);
    assert_eq!(settlement.refund, TOTAL);
    assert_eq!(settlement.recipient_balance, 0);
    assert_eq!(h.contract_balance(), 0);
}

/// Scenario: cancel with an unmet milestone in flight — the gated tranche
/// returns to the sender, not just its unaccrued fraction
///
/// This is the docs' day-10 worked example, and the figure that matters is that
/// the sender recovers the *whole* 12,000,000,000 tranche including the
/// 4,000,000,000 that had already accrued behind the shut gate.
#[test]
fn an_unmet_tranche_returns_whole_including_its_accrual() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(10);
    h.client.withdraw(&id);
    let settlement = h.client.cancel(&id);

    assert_eq!(
        settlement.refund, 24_000_000_000,
        "12,000,000,000 unstreamed base + the entire 12,000,000,000 gated tranche",
    );
    assert_eq!(
        settlement.recipient_balance, 0,
        "the base was already withdrawn"
    );
    h.assert_conserved(TOTAL);
    assert_eq!(h.contract_balance(), 0);
}

/// Scenario: cancel with a milestone already approved before cancellation
///
/// The docs' day-20 example. An approved tranche is treated exactly like base:
/// only its unstreamed remainder goes back.
#[test]
fn an_approved_tranche_is_treated_exactly_like_base() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(18);
    h.client.approve_milestone(&id, &0);
    h.client.withdraw(&id);

    h.warp_days(20);
    let settlement = h.client.cancel(&id);

    assert_eq!(
        settlement.refund, 10_000_000_000,
        "only the still-unstreamed third of both tranches",
    );
    assert_eq!(
        settlement.recipient_balance, 2_000_000_000,
        "streamed 20,000,000,000 less the 18,000,000,000 already taken",
    );
    h.assert_conserved(TOTAL);
}

/// Scenario: cancel after end, all milestones resolved — a genuine no-op
#[test]
fn cancel_after_end_with_everything_resolved_moves_nothing() {
    let h = Harness::new();
    let id = h.simple();

    h.warp_days(30);
    h.client.withdraw(&id);
    let settlement = h.client.cancel(&id);

    assert_eq!(settlement.refund, 0);
    assert_eq!(settlement.recipient_balance, 0);
}

/// Scenario: cancel after end with a milestone still unmet — the sender recovers
/// the whole tranche
///
/// The case #32 found the docs had wrong: this was described as "harmless,
/// refund = 0". With an unmet milestone the refund is the entire tranche, and
/// permitting the call is the only in-protocol way to resolve a milestone nobody
/// ever approved.
#[test]
fn cancel_after_end_with_an_unmet_milestone_is_not_a_no_op() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(30);
    h.client.withdraw(&id);
    let settlement = h.client.cancel(&id);

    assert_eq!(settlement.refund, GATED, "a real transfer, not nothing");
    h.assert_conserved(TOTAL);
    assert_eq!(h.contract_balance(), 0);
}

/// Scenario: rejected — cancel on a non-cancelable stream, sender authorizing
/// alone
#[test]
fn a_non_cancelable_stream_rejects_the_sender_alone() {
    let h = Harness::new();
    let id = h.create(TOTAL, START, false, h.no_milestones());
    h.warp_days(10);

    h.env.set_auths(&[]);
    assert!(
        h.client.try_cancel(&id).is_err(),
        "the sender cannot cancel a non-cancelable stream unilaterally",
    );
}

/// Scenario: cancel on a non-cancelable stream with both signatures — permitted,
/// settling exactly as a normal cancel
///
/// The #33 decision: `cancelable = false` means the sender cannot cancel
/// *alone*, not that nobody can.
#[test]
fn a_non_cancelable_stream_settles_with_both_signatures() {
    let h = Harness::new();
    let id = h.create(TOTAL, START, false, h.one_milestone());

    h.warp_days(10);
    h.client.withdraw(&id);
    let settlement = h.client.cancel(&id);

    assert_eq!(
        settlement.refund, 24_000_000_000,
        "identical settlement to the cancelable case — there is no separate path",
    );
    h.assert_conserved(TOTAL);
}

/// Cancelling twice has nothing to do the second time.
#[test]
fn cannot_cancel_twice() {
    let h = Harness::new();
    let id = h.simple();

    h.warp_days(10);
    h.client.cancel(&id);
    assert_eq!(h.client.try_cancel(&id), Err(Ok(Error::AlreadyCanceled)));
}

/// Cancellation resolves every shut gate, so a cancelled stream's milestones can
/// never later "expire" — they are already resolved.
#[test]
fn cancellation_forfeits_unmet_milestones_permanently() {
    let h = Harness::new();
    let deadline = END + 7 * DAY;
    let milestones = vec![&h.env, h.milestone(GATED, deadline, OnExpiry::ToRecipient)];
    let id = h.create(TOTAL, START, true, milestones);

    h.warp_days(10);
    h.client.cancel(&id);

    assert_eq!(
        h.client.get_stream(&id).milestones.get(0).unwrap().state,
        MilestoneState::Forfeited,
    );

    h.warp_to(deadline + DAY);
    let view = h.client.describe(&id);
    assert_eq!(
        view.position.held, 0,
        "a forfeited tranche does not resurrect at its deadline",
    );
    assert_eq!(view.position.streamed_total, BASE * 10 / 30);
}

/// `preview_cancel` must agree with what `cancel` actually does — it is what a
/// UI shows both parties before either signs.
#[test]
fn preview_matches_the_real_settlement() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(13);
    let preview = h.client.preview_cancel(&id);
    let actual = h.client.cancel(&id);

    assert_eq!(preview.refund, actual.refund);
    assert_eq!(preview.recipient_balance, actual.recipient_balance);
}

#[test]
fn rejects_an_unknown_stream() {
    let h = Harness::new();
    assert_eq!(h.client.try_cancel(&404), Err(Ok(Error::StreamNotFound)));
}
