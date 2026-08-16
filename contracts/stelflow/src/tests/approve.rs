//! `docs/behaviour.md` → Feature: approve_milestone

use soroban_sdk::vec;

use super::*;
use crate::{Error, MilestoneState, OnExpiry};

/// Scenario: happy path — approval releases accrued-to-date, not just future
/// accrual
#[test]
fn approval_releases_what_already_accrued_behind_the_gate() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(18);
    assert_eq!(
        h.client.claimable(&id),
        BASE * 18 / 30,
        "before approval, only the base is claimable",
    );

    h.client.approve_milestone(&id, &0);

    assert_eq!(
        h.client.claimable(&id),
        18_000_000_000,
        "approval unlocks the tranche's accrual back to day zero, not from today",
    );
    assert_eq!(h.client.describe(&id).position.held, 0);
}

/// Scenario: approval after the stream's end releases the full tranche, with no
/// bonus for lateness
#[test]
fn late_approval_releases_the_tranche_but_no_more() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(90);
    h.client.approve_milestone(&id, &0);

    assert_eq!(
        h.client.claimable(&id),
        TOTAL,
        "the whole deposit, never more"
    );
    assert_eq!(h.client.withdraw(&id), TOTAL);
    assert_eq!(h.contract_balance(), 0);
}

/// Scenario: rejected — approve_milestone is only callable by that milestone's
/// named approver
#[test]
fn only_the_named_approver_may_approve() {
    let h = Harness::new();
    let id = h.alice_and_bob();
    h.warp_days(10);

    h.env.set_auths(&[]);
    assert!(
        h.client.try_approve_milestone(&id, &0).is_err(),
        "an unauthorized approval must be rejected",
    );
}

/// Scenario: double approval of an already-met milestone — no-op, not an error
///
/// Settled in #32: a duplicate is overwhelmingly a retry after an uncertain
/// outcome, and erroring punishes the honest retry to protect state that cannot
/// change anyway.
#[test]
fn double_approval_is_absorbed_silently() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(18);
    h.client.approve_milestone(&id, &0);
    let after_first = h.client.claimable(&id);

    h.client.approve_milestone(&id, &0);

    assert_eq!(h.client.claimable(&id), after_first, "no state changed");
    assert_eq!(
        h.client.get_stream(&id).milestones.get(0).unwrap().state,
        MilestoneState::Met,
    );
}

/// Authorization is still checked *before* the no-op absorbs the call, so a
/// non-approver is rejected rather than silently swallowed.
#[test]
fn double_approval_still_checks_authorization_first() {
    let h = Harness::new();
    let id = h.alice_and_bob();
    h.warp_days(18);
    h.client.approve_milestone(&id, &0);

    h.env.set_auths(&[]);
    assert!(
        h.client.try_approve_milestone(&id, &0).is_err(),
        "a stranger must not get a free success just because the state is terminal",
    );
}

/// Scenario: approving a milestone on an already-cancelled stream is rejected
#[test]
fn cannot_approve_on_a_cancelled_stream() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(10);
    h.client.cancel(&id);

    assert_eq!(
        h.client.try_approve_milestone(&id, &0),
        Err(Ok(Error::AlreadyCanceled)),
        "the cancellation is the cause, and naming it beats naming its consequence",
    );
    assert_eq!(
        h.client.get_stream(&id).milestones.get(0).unwrap().state,
        MilestoneState::Forfeited,
        "the tranche did go back to the sender — that is just not the useful error",
    );
}

#[test]
fn rejects_an_index_that_does_not_exist() {
    let h = Harness::new();
    let id = h.alice_and_bob();
    assert_eq!(
        h.client.try_approve_milestone(&id, &7),
        Err(Ok(Error::MilestoneNotFound)),
    );
}

/// `Met` is terminal, so approval can only ever raise claimable.
#[test]
fn approval_never_reduces_claimable() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    for day in [1u64, 5, 12, 19, 26, 30] {
        h.warp_days(day);
        let before = h.client.claimable(&id);
        if day == 19 {
            h.client.approve_milestone(&id, &0);
        }
        assert!(
            h.client.claimable(&id) >= before,
            "claimable fell at day {}",
            day,
        );
    }
}

// ---------------------------------------------------------------------------
// Milestone deadlines — docs/milestone-deadlines.md
// ---------------------------------------------------------------------------

/// A deadline resolving to the recipient unlocks the tranche without anyone
/// acting. Expiry is evaluated on read; no transaction marks it.
#[test]
fn an_expired_deadline_can_release_to_the_recipient() {
    let h = Harness::new();
    let deadline = END + 7 * DAY;
    let milestones = vec![&h.env, h.milestone(GATED, deadline, OnExpiry::ToRecipient)];
    let id = h.create(TOTAL, START, true, milestones);

    h.warp_to(deadline - 1);
    assert_eq!(
        h.client.claimable(&id),
        BASE,
        "still held, one second early"
    );

    h.warp_to(deadline);
    assert_eq!(
        h.client.claimable(&id),
        TOTAL,
        "resolved without any transaction"
    );
    assert_eq!(h.client.withdraw(&id), TOTAL);
}

/// The same deadline pointed the other way returns the tranche to the sender.
#[test]
fn an_expired_deadline_can_forfeit_to_the_sender() {
    let h = Harness::new();
    let deadline = END + 7 * DAY;
    let milestones = vec![&h.env, h.milestone(GATED, deadline, OnExpiry::ToSender)];
    let id = h.create(TOTAL, START, true, milestones);

    h.warp_to(deadline);
    assert_eq!(
        h.client.claimable(&id),
        BASE,
        "the gated tranche is the sender's"
    );

    let view = h.client.describe(&id);
    assert_eq!(view.position.streamed_total, BASE);
    assert_eq!(view.position.held, 0, "forfeited, not held");
}

/// Rule 4: an approved milestone ignores its deadline entirely. A deadline that
/// could undo an approval would be revocation through the back door.
#[test]
fn approval_survives_its_own_deadline() {
    let h = Harness::new();
    let deadline = END + 7 * DAY;
    let milestones = vec![&h.env, h.milestone(GATED, deadline, OnExpiry::ToSender)];
    let id = h.create(TOTAL, START, true, milestones);

    h.warp_days(10);
    h.client.approve_milestone(&id, &0);

    h.warp_to(deadline + DAY);
    assert_eq!(
        h.client.claimable(&id),
        TOTAL,
        "an approved tranche is not clawed back by its deadline",
    );
}

/// A zero deadline means wait indefinitely — exactly the pre-#38 behaviour.
#[test]
fn a_zero_deadline_never_expires() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_to(END + 3650 * DAY);
    assert_eq!(h.client.claimable(&id), BASE, "still waiting, ten years on");
    assert_eq!(h.client.describe(&id).position.held, GATED);
}
