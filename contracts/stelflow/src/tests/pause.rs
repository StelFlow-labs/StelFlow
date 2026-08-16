//! `docs/behaviour.md` → Feature: pause
//!
//! These mostly pin down what the pause *cannot* do, which is the load-bearing
//! half. See `docs/upgradeability-and-pause.md`.

use super::*;
use crate::{Error, PAUSE_DURATION_SECONDS};

/// Scenario: pausing blocks create_stream and nothing else
#[test]
fn pausing_stops_creation_and_leaves_everything_else_alone() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    h.warp_days(18);
    h.client.pause();

    assert_eq!(
        h.client.try_create_stream(
            &h.sender,
            &h.recipient,
            &h.token_id,
            &TOTAL,
            &START,
            &END,
            &START,
            &true,
            &h.no_milestones(),
        ),
        Err(Ok(Error::Paused)),
        "new exposure is stopped",
    );

    // Everything touching the existing stream still works, unchanged.
    h.client.approve_milestone(&id, &0);
    assert_eq!(h.client.withdraw(&id), 18_000_000_000);
    h.client.bump_stream(&id);
    h.client.cancel(&id);
    h.assert_conserved(TOTAL);
}

/// Scenario: a paused contract still cannot touch existing funds
#[test]
fn the_pauser_gains_no_authority_over_any_stream() {
    let h = Harness::new();
    let id = h.simple();
    h.client.pause();
    h.warp_days(10);

    // The pauser is not a party to this stream. Their role confers nothing.
    h.env.set_auths(&[]);
    assert!(
        h.client.try_withdraw(&id).is_err(),
        "the pause is a create-time gate, not a role over funds",
    );
    assert!(h.client.try_cancel(&id).is_err());
}

/// Scenario: rejected — only the pauser can pause
#[test]
fn only_the_pauser_may_pause() {
    let h = Harness::new();
    h.env.set_auths(&[]);
    assert!(h.client.try_pause().is_err());
    assert!(h.client.try_unpause().is_err());
}

/// Scenario: the pause expires on its own
///
/// Without expiry, a pause key lost while engaged would disable `create_stream`
/// permanently — there is no upgrade that could rescue it.
#[test]
fn the_pause_lifts_by_itself() {
    let h = Harness::new();
    let until = h.client.pause();
    assert_eq!(until, START + PAUSE_DURATION_SECONDS);

    h.warp_to(until - 1);
    assert_eq!(h.client.paused_until(), until, "still paused");

    h.warp_to(until);
    assert_eq!(
        h.client.paused_until(),
        0,
        "lifted with no transaction from anyone"
    );
    h.simple();
}

#[test]
fn unpausing_is_immediate() {
    let h = Harness::new();
    h.client.pause();
    h.client.unpause();
    assert_eq!(h.client.paused_until(), 0);
    h.simple();
}

#[test]
fn pausing_again_extends_the_window() {
    let h = Harness::new();
    let first = h.client.pause();
    h.warp_to(first - DAY);
    let second = h.client.pause();
    assert!(second > first, "renewal is one transaction");
}

/// Scenario: renouncing the pauser role is permanent
#[test]
fn renouncing_is_irreversible() {
    let h = Harness::new();
    assert_eq!(h.client.pauser(), Some(h.pauser.clone()));

    h.client.renounce_pauser();

    assert_eq!(h.client.pauser(), None);
    assert_eq!(h.client.try_pause(), Err(Ok(Error::NotPauser)));
    assert_eq!(
        h.client.try_transfer_pauser(&h.stranger),
        Err(Ok(Error::NotPauser)),
        "nothing can restore the role — there is no upgrade path",
    );
    h.simple();
}

#[test]
fn the_role_can_be_handed_on() {
    let h = Harness::new();
    h.client.transfer_pauser(&h.stranger);
    assert_eq!(h.client.pauser(), Some(h.stranger.clone()));
}

/// A contract may be deployed with no pauser at all — privilege-free from its
/// first ledger.
#[test]
fn deploying_without_a_pauser_is_allowed() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(StelFlow, (None::<soroban_sdk::Address>,));
    let client = crate::StelFlowClient::new(&env, &contract_id);

    assert_eq!(client.pauser(), None);
    assert_eq!(client.try_pause(), Err(Ok(Error::NotPauser)));
}

/// Scenario: a payout can never exceed its own stream's remaining deposit
///
/// The conservation invariant is a closure check and would balance either way,
/// so this is asserted separately across two independently funded streams.
#[test]
fn payouts_stay_inside_their_own_stream() {
    let h = Harness::new();
    let first = h.alice_and_bob();
    let second = h.simple();

    h.warp_days(30);
    h.client.approve_milestone(&first, &0);
    h.client.withdraw(&first);
    h.client.withdraw(&second);

    h.assert_solvent(first);
    h.assert_solvent(second);
    assert_eq!(
        h.contract_balance(),
        0,
        "two deposits in, two deposits out, nothing borrowed between them",
    );
}
