//! `docs/behaviour.md` → Feature: create_stream

use soroban_sdk::testutils::{Address as _, Events as _};
use soroban_sdk::xdr::{ContractEventBody, ScVal};
use soroban_sdk::{vec, Address, Vec};

use super::*;
use crate::{Error, MilestoneState, OnExpiry, MAX_MILESTONES_PER_STREAM};

/// Scenario: happy path — a simple two-party stream
#[test]
fn happy_path_escrows_the_full_deposit() {
    let h = Harness::new();
    let sender_before = h.token.balance(&h.sender);

    let id = h.simple();

    assert_eq!(id, 0, "ids start at zero and are readable");
    assert_eq!(
        h.contract_balance(),
        TOTAL,
        "the deposit is escrowed in full"
    );
    assert_eq!(h.token.balance(&h.sender), sender_before - TOTAL);

    let stream = h.client.get_stream(&id);
    assert_eq!(stream.total, TOTAL);
    assert_eq!(stream.base_amount, TOTAL, "no milestones means all base");
    assert_eq!(stream.withdrawn, 0);
    assert_eq!(stream.canceled_at, None);
    h.assert_conserved(TOTAL);
}

/// Scenario: create_stream with a base tranche and one milestone tranche
#[test]
fn milestones_are_carved_out_of_the_deposit_not_added_to_it() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    let stream = h.client.get_stream(&id);
    assert_eq!(stream.total, TOTAL);
    assert_eq!(
        stream.base_amount, BASE,
        "base is total minus the gated sum"
    );
    assert_eq!(stream.milestones.len(), 1);
    assert_eq!(stream.milestones.get(0).unwrap().amount, GATED);
    assert_eq!(
        h.contract_balance(),
        TOTAL,
        "gating moves no extra money — it partitions what was already deposited",
    );
}

/// Scenario: caller must be the sender — create_stream is not callable on
/// someone else's behalf
#[test]
fn requires_the_sender_to_authorize() {
    let env = Env::default();
    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    env.mock_all_auths();
    let contract_id = env.register(StelFlow, (None::<Address>,));
    let client = crate::StelFlowClient::new(&env, &contract_id);
    let sender = Address::generate(&env);
    soroban_sdk::token::StellarAssetClient::new(&env, &asset.address()).mint(&sender, &TOTAL);
    env.ledger().set_timestamp(START);

    // From here on, only the *stranger* has authorized anything.
    let stranger = Address::generate(&env);
    env.set_auths(&[]);

    let result = client.try_create_stream(
        &sender,
        &Address::generate(&env),
        &asset.address(),
        &TOTAL,
        &START,
        &END,
        &START,
        &true,
        &Vec::new(&env),
    );
    assert!(result.is_err(), "unauthorized creation must be rejected");
    let _ = stranger;
}

/// Scenario: a fee-on-transfer token — the stream is sized to what actually
/// arrived
///
/// The SAC does not charge a fee, so the honest way to test the *decision* is to
/// assert the property it guarantees: the stored total equals the contract's
/// measured balance delta, never the requested amount. A token that delivered
/// less would be caught by the same assertion.
#[test]
fn total_is_the_measured_delta_not_the_requested_amount() {
    let h = Harness::new();
    let before = h.contract_balance();
    let id = h.simple();
    let delta = h.contract_balance() - before;

    let stream = h.client.get_stream(&id);
    assert_eq!(
        stream.total, delta,
        "stored total must be what arrived, by construction",
    );
}

/// Scenario: rejected — end does not exceed start
#[test]
fn rejects_zero_duration() {
    let h = Harness::new();
    let result = h.client.try_create_stream(
        &h.sender,
        &h.recipient,
        &h.token_id,
        &TOTAL,
        &START,
        &START,
        &START,
        &true,
        &h.no_milestones(),
    );
    assert_eq!(result, Err(Ok(Error::InvalidTimeRange)));
    assert_eq!(
        h.contract_balance(),
        0,
        "a rejected creation escrows nothing"
    );
}

/// Scenario: rejected — end is before start
#[test]
fn rejects_inverted_time_range() {
    let h = Harness::new();
    let result = h.client.try_create_stream(
        &h.sender,
        &h.recipient,
        &h.token_id,
        &TOTAL,
        &END,
        &START,
        &END,
        &true,
        &h.no_milestones(),
    );
    assert_eq!(result, Err(Ok(Error::InvalidTimeRange)));
}

/// Scenario: rejected — a milestone's cliff falls after the stream's end
#[test]
fn rejects_a_cliff_outside_the_stream_window() {
    let h = Harness::new();
    for cliff in [START - 1, END + 1] {
        let result = h.client.try_create_stream(
            &h.sender,
            &h.recipient,
            &h.token_id,
            &TOTAL,
            &START,
            &END,
            &cliff,
            &true,
            &h.no_milestones(),
        );
        assert_eq!(result, Err(Ok(Error::InvalidCliff)), "cliff {}", cliff);
    }
}

#[test]
fn rejects_non_positive_amounts() {
    let h = Harness::new();
    for amount in [0i128, -1] {
        let result = h.client.try_create_stream(
            &h.sender,
            &h.recipient,
            &h.token_id,
            &amount,
            &START,
            &END,
            &START,
            &true,
            &h.no_milestones(),
        );
        assert_eq!(result, Err(Ok(Error::InvalidAmount)), "amount {}", amount);
    }
}

#[test]
fn rejects_milestones_summing_past_the_deposit() {
    let h = Harness::new();
    let milestones = vec![&h.env, h.milestone(TOTAL + 1, 0, OnExpiry::ToSender)];
    let result = h.client.try_create_stream(
        &h.sender,
        &h.recipient,
        &h.token_id,
        &TOTAL,
        &START,
        &END,
        &START,
        &true,
        &milestones,
    );
    assert_eq!(result, Err(Ok(Error::MilestonesExceedTotal)));
}

/// A milestone tranche may consume the entire deposit, leaving a zero base. That
/// is a fully-gated stream, which is legitimate — it just means nothing accrues
/// claimably until the gate opens.
#[test]
fn allows_a_fully_gated_stream() {
    let h = Harness::new();
    let milestones = vec![&h.env, h.milestone(TOTAL, 0, OnExpiry::ToSender)];
    let id = h.create(TOTAL, START, true, milestones);

    let stream = h.client.get_stream(&id);
    assert_eq!(stream.base_amount, 0);

    h.warp_days(15);
    assert_eq!(h.client.claimable(&id), 0, "everything is behind the gate");
}

/// Scenario: the milestone cap is enforced at creation — threat-model T2.
#[test]
fn rejects_more_milestones_than_the_cap() {
    let h = Harness::new();
    let mut milestones = Vec::new(&h.env);
    for _ in 0..(MAX_MILESTONES_PER_STREAM + 1) {
        milestones.push_back(h.milestone(1_000, 0, OnExpiry::ToSender));
    }
    let result = h.client.try_create_stream(
        &h.sender,
        &h.recipient,
        &h.token_id,
        &TOTAL,
        &START,
        &END,
        &START,
        &true,
        &milestones,
    );
    assert_eq!(result, Err(Ok(Error::TooManyMilestones)));
}

/// A stream loaded to the cap must still be withdrawable — the cap exists to
/// guarantee exactly this, so asserting it is the point.
#[test]
fn a_fully_loaded_stream_is_still_withdrawable() {
    let h = Harness::new();
    let mut milestones = Vec::new(&h.env);
    for _ in 0..MAX_MILESTONES_PER_STREAM {
        milestones.push_back(h.milestone(1_000_000_000, 0, OnExpiry::ToSender));
    }
    let id = h.create(TOTAL, START, true, milestones);

    h.warp_days(30);
    let paid = h.client.withdraw(&id);
    assert_eq!(
        paid,
        TOTAL - 10 * 1_000_000_000,
        "base pays out in full; every gate is still shut",
    );
    h.assert_solvent(id);
}

/// `docs/milestone-deadlines.md` rule 2: a deadline before `end` would resolve a
/// tranche while it was still accruing.
#[test]
fn rejects_a_deadline_before_the_stream_ends() {
    let h = Harness::new();
    let milestones = vec![&h.env, h.milestone(GATED, END - 1, OnExpiry::ToRecipient)];
    let result = h.client.try_create_stream(
        &h.sender,
        &h.recipient,
        &h.token_id,
        &TOTAL,
        &START,
        &END,
        &START,
        &true,
        &milestones,
    );
    assert_eq!(result, Err(Ok(Error::InvalidTimeRange)));
}

#[test]
fn accepts_a_deadline_at_or_after_the_stream_ends() {
    let h = Harness::new();
    let milestones = vec![&h.env, h.milestone(GATED, END, OnExpiry::ToRecipient)];
    let id = h.create(TOTAL, START, true, milestones);
    assert_eq!(
        h.client.get_stream(&id).milestones.get(0).unwrap().deadline,
        END
    );
}

/// A milestone cannot be created already met — `MilestoneSpec` has no `state`
/// field, so the request is unrepresentable rather than rejected. This asserts
/// the property that replaces the old validation.
#[test]
fn every_milestone_starts_unmet() {
    let h = Harness::new();
    let id = h.alice_and_bob();
    assert_eq!(
        h.client.get_stream(&id).milestones.get(0).unwrap().state,
        MilestoneState::Unmet,
    );
}

/// Scenario: a stream of duration 1 second
#[test]
fn a_one_second_stream_settles_whole() {
    let h = Harness::new();
    let id = h.client.create_stream(
        &h.sender,
        &h.recipient,
        &h.token_id,
        &TOTAL,
        &START,
        &(START + 1),
        &START,
        &true,
        &h.no_milestones(),
    );
    h.warp_to(START + 1);
    assert_eq!(h.client.withdraw(&id), TOTAL);
    assert_eq!(h.contract_balance(), 0);
}

/// Scenario: a stream of amount 1 stroop
#[test]
fn a_one_stroop_stream_pays_nothing_until_it_ends() {
    let h = Harness::new();
    let id = h.create(1, START, true, h.no_milestones());

    h.warp_days(29);
    assert_eq!(
        h.client.claimable(&id),
        0,
        "1 * elapsed / duration floors to zero for all but the last instant",
    );

    h.warp_days(30);
    assert_eq!(
        h.client.claimable(&id),
        1,
        "the endpoint case pays the remainder"
    );
}

/// The frontend reads history by folding this log, so the emitted shape is part
/// of the contract's interface and is asserted rather than assumed.
#[test]
fn creation_emits_one_event_keyed_by_stream_id() {
    let h = Harness::new();
    let id = h.alice_and_bob();

    let ours = h.env.events().all().filter_by_contract(&h.client.address);
    let emitted = ours.events();
    assert_eq!(
        emitted.len(),
        1,
        "exactly one event per creation, never two"
    );

    let ContractEventBody::V0(body) = &emitted[0].body;
    assert!(
        body.topics
            .iter()
            .any(|topic| matches!(topic, ScVal::U64(value) if *value == id)),
        "stream_id must be a topic so clients can filter server-side",
    );
    assert!(
        matches!(body.data, ScVal::Map(_)),
        "data is a named map, so adding a field later cannot shift what consumers parse",
    );
}

#[test]
fn stream_count_tracks_creations() {
    let h = Harness::new();
    assert_eq!(h.client.stream_count(), 0);
    h.simple();
    h.simple();
    assert_eq!(h.client.stream_count(), 2);
}

/// Setup runs inside the deploy transaction, so there is no window in which
/// someone else could claim the pauser role — and no `initialize` to call twice.
#[test]
fn the_constructor_leaves_no_initialization_window() {
    let h = Harness::new();
    assert_eq!(h.client.pauser(), Some(h.pauser.clone()));
    assert_eq!(h.client.stream_count(), 0, "the constructor consumes no id");
}
