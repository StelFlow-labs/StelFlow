//! The behaviour specs, executed.
//!
//! Every test here corresponds to a named scenario in `docs/behaviour.md`, and
//! the doc comment on each one quotes the scenario title so the two stay
//! traceable in both directions. That document was written before any code
//! existed, precisely so the tests could not be shaped to fit the implementation.
//!
//! Amounts follow the docs' worked example throughout: 30,000,000,000 stroops
//! over 30 days, split 18,000,000,000 base and 12,000,000,000 behind one
//! milestone. Numbers divide evenly on days 10, 18, and 20 so the arithmetic can
//! be checked by hand. Tests that exist to exercise rounding say so and use
//! awkward numbers on purpose.

mod accrual_properties;
mod approve;
mod cancel;
mod create;
mod pause;
mod withdraw;

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{vec, Address, Env, Vec};

use crate::{MilestoneSpec, OnExpiry, StelFlow, StelFlowClient};

pub const DAY: u64 = 86_400;
pub const START: u64 = 1_000_000;
pub const DURATION: u64 = 30 * DAY;
pub const END: u64 = START + DURATION;

pub const TOTAL: i128 = 30_000_000_000;
pub const BASE: i128 = 18_000_000_000;
pub const GATED: i128 = 12_000_000_000;

/// A deployed contract plus the cast of addresses every scenario needs.
pub struct Harness<'a> {
    pub env: Env,
    pub client: StelFlowClient<'a>,
    pub token: TokenClient<'a>,
    pub minter: StellarAssetClient<'a>,
    pub token_id: Address,
    pub sender: Address,
    pub recipient: Address,
    pub approver: Address,
    pub pauser: Address,
    pub stranger: Address,
}

impl<'a> Harness<'a> {
    /// Deploy with a pauser, mint the sender a working balance, and park the
    /// ledger just before any stream begins.
    pub fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let issuer = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(issuer);
        let token_id = asset.address();

        let pauser = Address::generate(&env);
        let contract_id = env.register(StelFlow, (Some(pauser.clone()),));
        let client = StelFlowClient::new(&env, &contract_id);

        let sender = Address::generate(&env);
        let harness = Self {
            token: TokenClient::new(&env, &token_id),
            minter: StellarAssetClient::new(&env, &token_id),
            recipient: Address::generate(&env),
            approver: Address::generate(&env),
            stranger: Address::generate(&env),
            token_id,
            sender,
            pauser,
            client,
            env,
        };
        harness.minter.mint(&harness.sender, &(TOTAL * 10));
        harness.warp_to(START);
        harness
    }

    /// Move the ledger clock to an absolute timestamp.
    pub fn warp_to(&self, timestamp: u64) {
        self.env.ledger().set_timestamp(timestamp);
    }

    /// Move the ledger clock to `START + days`.
    pub fn warp_days(&self, days: u64) {
        self.warp_to(START + days * DAY);
    }

    pub fn no_milestones(&self) -> Vec<MilestoneSpec> {
        Vec::new(&self.env)
    }

    /// One milestone holding `GATED`, approved by `self.approver`, no deadline.
    pub fn one_milestone(&self) -> Vec<MilestoneSpec> {
        vec![&self.env, self.milestone(GATED, 0, OnExpiry::ToSender)]
    }

    pub fn milestone(&self, amount: i128, deadline: u64, on_expiry: OnExpiry) -> MilestoneSpec {
        MilestoneSpec {
            amount,
            approver: self.approver.clone(),
            deadline,
            on_expiry,
        }
    }

    /// The docs' worked example: 30,000,000,000 over 30 days, 12,000,000,000 of
    /// it gated behind one milestone, cancelable, no cliff.
    pub fn alice_and_bob(&self) -> u64 {
        self.create(TOTAL, START, true, self.one_milestone())
    }

    /// An ungated stream of `TOTAL` over the standard window.
    pub fn simple(&self) -> u64 {
        self.create(TOTAL, START, true, self.no_milestones())
    }

    pub fn create(
        &self,
        amount: i128,
        cliff: u64,
        cancelable: bool,
        milestones: Vec<MilestoneSpec>,
    ) -> u64 {
        self.client.create_stream(
            &self.sender,
            &self.recipient,
            &self.token_id,
            &amount,
            &START,
            &END,
            &cliff,
            &cancelable,
            &milestones,
        )
    }

    pub fn contract_balance(&self) -> i128 {
        self.token.balance(&self.client.address)
    }

    /// The invariant every state-changing scenario asserts:
    /// `deposit == withdrawn + refunded + remaining_in_contract`.
    ///
    /// Note this is a *closure* check across the whole contract — it balances
    /// even if one stream were paid out of another's deposit. Cross-stream
    /// isolation is a separate assertion; see [`assert_solvent`].
    pub fn assert_conserved(&self, deposit: i128) {
        let withdrawn: i128 = (0..self.client.stream_count())
            .map(|id| self.client.get_stream(&id).withdrawn)
            .sum();
        // Whatever the sender holds above their post-deposit balance came back
        // as a refund.
        let refunded = self.token.balance(&self.sender) - (TOTAL * 10 - deposit);
        assert_eq!(
            deposit,
            withdrawn + refunded + self.contract_balance(),
            "value conservation: deposit != withdrawn + refunded + remaining",
        );
    }

    /// No stream has extracted more than its own deposit.
    ///
    /// The contract's token balance is pooled, so this is what actually keeps
    /// streams isolated from one another. See `docs/upgradeability-and-pause.md`.
    pub fn assert_solvent(&self, stream_id: u64) {
        let stream = self.client.get_stream(&stream_id);
        assert!(
            stream.withdrawn <= stream.total,
            "stream {} withdrew {} against a deposit of {}",
            stream_id,
            stream.withdrawn,
            stream.total,
        );
    }
}
