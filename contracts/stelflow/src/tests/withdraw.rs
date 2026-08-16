//! `docs/behaviour.md` → Feature: withdraw

use super::*;
use crate::Error;

/// Scenario: happy path — partial withdrawal mid-stream
#[test]
fn pays_exactly_the_elapsed_fraction() {
    let h = Harness::new();
    let id = h.simple();

    h.warp_days(10);
    let paid = h.client.withdraw(&id);

    assert_eq!(paid, TOTAL / 3, "10 of 30 days elapsed");
    assert_eq!(h.token.balance(&h.recipient), TOTAL / 3);
    assert_eq!(h.client.get_stream(&id).withdrawn, TOTAL / 3);
    h.assert_conserved(TOTAL);
    h.assert_solvent(id);
}

/// Scenario: withdraw at exactly start
#[test]
fn pays_nothing_at_start() {
    let h = Harness::new();
    let id = h.simple();
    assert_eq!(
        h.client.try_withdraw(&id),
        Err(Ok(Error::NothingToWithdraw))
    );
}

/// Scenario: withdraw at exactly end
#[test]
fn pays_the_whole_deposit_at_end() {
    let h = Harness::new();
    let id = h.simple();

    h.warp_days(30);
    assert_eq!(h.client.withdraw(&id), TOTAL);
    assert_eq!(
        h.contract_balance(),
        0,
        "the stream settles to exactly its deposit"
    );
    h.assert_conserved(TOTAL);
}

/// Past `end` nothing further accrues — there is nothing left to accrue.
#[test]
fn pays_no_more_after_end() {
    let h = Harness::new();
    let id = h.simple();

    h.warp_days(30);
    h.client.withdraw(&id);
    h.warp_days(365);
    assert_eq!(
        h.client.try_withdraw(&id),
        Err(Ok(Error::NothingToWithdraw))
    );
}

/// Scenario: two withdrawals in the same ledger — the second is a no-op, not a
/// failure
///
/// It surfaces as `NothingToWithdraw` rather than succeeding with zero: the
/// caller paid a fee for a state change that didn't happen, and saying so is
/// friendlier than a silent success.
#[test]
fn a_second_withdrawal_in_the_same_ledger_moves_nothing() {
    let h = Harness::new();
    let id = h.simple();

    h.warp_days(10);
    let first = h.client.withdraw(&id);
    assert_eq!(
        h.client.try_withdraw(&id),
        Err(Ok(Error::NothingToWithdraw))
    );
    assert_eq!(h.token.balance(&h.recipient), first);
}

/// Scenario: rejected — withdraw is only callable by the recipient
#[test]
fn only_the_recipient_may_withdraw() {
    let h = Harness::new();
    let id = h.simple();
    h.warp_days(10);

    // Drop every mocked authorization, then confirm the call cannot proceed.
    h.env.set_auths(&[]);
    assert!(
        h.client.try_withdraw(&id).is_err(),
        "an unauthorized withdrawal must be rejected",
    );
}

/// Scenario: withdraw is reduced by an unmet milestone gate
#[test]
fn an_unmet_gate_withholds_its_accrual() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(10);
    let view = h.client.describe(&id);
    assert_eq!(
        view.position.streamed_total, 10_000_000_000,
        "both tranches accrue"
    );
    assert_eq!(
        view.position.held, 4_000_000_000,
        "the gated third of the tranche"
    );
    assert_eq!(view.position.claimable, 6_000_000_000, "base only");

    assert_eq!(h.client.withdraw(&id), 6_000_000_000);
    h.assert_conserved(TOTAL);
}

/// Repeated withdrawals must not drift from a single one — truncation is
/// recomputed, never accumulated.
#[test]
fn many_small_withdrawals_equal_one_large_one() {
    let h = Harness::new();
    let id = h.simple();

    let mut total_paid = 0i128;
    for day in 1..=30 {
        h.warp_days(day);
        if let Ok(Ok(paid)) = h.client.try_withdraw(&id) {
            total_paid += paid;
        }
    }
    assert_eq!(
        total_paid, TOTAL,
        "thirty withdrawals settle to the exact deposit"
    );
    assert_eq!(h.contract_balance(), 0);
}

/// Scenario: the indivisible-total stream settles to the exact deposit at the
/// final withdrawal
#[test]
fn an_indivisible_total_still_settles_exactly() {
    let h = Harness::new();
    // 30,000,000,001 over 30 days: never divides evenly.
    let id = h.create(TOTAL + 1, START, true, h.no_milestones());

    let mut paid = 0i128;
    for day in 1..=30 {
        h.warp_days(day);
        if let Ok(Ok(amount)) = h.client.try_withdraw(&id) {
            paid += amount;
        }
    }
    assert_eq!(
        paid,
        TOTAL + 1,
        "the endpoint case sweeps up every truncated stroop"
    );
    assert_eq!(h.contract_balance(), 0);
}

/// A cliff withholds claimability without pausing accrual.
#[test]
fn a_cliff_withholds_everything_then_releases_it_at_once() {
    let h = Harness::new();
    let cliff = START + 10 * DAY;
    let id = h.create(TOTAL, cliff, true, h.no_milestones());

    h.warp_days(9);
    let before = h.client.describe(&id);
    assert_eq!(
        before.position.claimable, 0,
        "nothing claimable inside the cliff"
    );
    assert_eq!(
        before.position.streamed_total,
        TOTAL * 9 / 30,
        "but accrual has been running the whole time",
    );

    h.warp_days(10);
    assert_eq!(
        h.client.claimable(&id),
        TOTAL / 3,
        "the cliff releases everything accrued to that point",
    );
}

/// Scenario: withdraw against a stream that does not exist
#[test]
fn rejects_an_unknown_stream() {
    let h = Harness::new();
    assert_eq!(h.client.try_withdraw(&404), Err(Ok(Error::StreamNotFound)));
}

/// Two streams share one pooled token balance. Neither may reach the other's
/// deposit — the assertion that replaces a withdrawal pause.
#[test]
fn one_stream_cannot_drain_another() {
    let h = Harness::new();
    let first = h.simple();
    let second = h.simple();

    h.warp_days(30);
    assert_eq!(h.client.withdraw(&first), TOTAL);
    assert_eq!(h.client.withdraw(&second), TOTAL);

    h.assert_solvent(first);
    h.assert_solvent(second);
    assert_eq!(h.contract_balance(), 0);
    assert_eq!(h.token.balance(&h.recipient), TOTAL * 2);
}

/// `touch` is permissionless by design: anyone may keep a dormant stream alive.
#[test]
fn anyone_can_extend_a_streams_ttl() {
    let h = Harness::new();
    let id = h.simple();
    h.client.bump_stream(&id);
    assert_eq!(
        h.client.try_bump_stream(&404),
        Err(Ok(Error::StreamNotFound))
    );
}
