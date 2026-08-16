//! Contract events.
//!
//! These are the product's read path, not a debugging aid. Soroban contracts
//! cannot be queried historically from inside the chain, so everything the
//! dashboard shows about the past is reconstructed by folding this log — see
//! `docs/indexer-design.md`.
//!
//! Declared with `#[contractevent]`, so each event carries a self-describing map
//! of named fields and appears in the contract's generated interface. A client
//! reads `stream_id` by name rather than by tuple position, which means adding a
//! field later cannot silently shift what an existing consumer parses.
//!
//! Three rules shape the set below, and each is load-bearing:
//!
//! 1. **Every stream event carries `stream_id` as a topic**, so a client filters
//!    server-side instead of pulling the whole log and discarding most of it.
//! 2. **Events record actions, never the passage of time.** Nothing fires when a
//!    cliff lapses, a milestone deadline expires, or a stream reaches `end` —
//!    nothing happens on-chain at those instants. A client derives them from the
//!    same stored fields and clock the contract uses.
//! 3. **An action emits exactly one event, once.** A duplicate `approve_milestone`
//!    is absorbed silently, so a fold can treat each event as a distinct state
//!    transition without deduplicating by hand.

use soroban_sdk::{contractevent, Address};

/// A stream was opened and its deposit escrowed.
///
/// `total` is the **measured** amount that arrived, which for a fee-on-transfer
/// token is less than the sender asked to send. A client should render this
/// figure rather than the one from the submitted transaction.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamCreated {
    #[topic]
    pub stream_id: u64,
    #[topic]
    pub sender: Address,
    #[topic]
    pub recipient: Address,
    pub token: Address,
    pub total: i128,
    pub start: u64,
    pub end: u64,
    pub cliff: u64,
    pub cancelable: bool,
    pub milestone_count: u32,
}

/// The recipient took some of what had accrued.
///
/// Carries the running total as well as the delta, so a client that missed an
/// earlier event still renders a correct balance from the latest one.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdrawn {
    #[topic]
    pub stream_id: u64,
    #[topic]
    pub recipient: Address,
    pub amount: i128,
    pub withdrawn_total: i128,
}

/// An approver opened a gate. Emitted at most once per milestone, ever.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneApproved {
    #[topic]
    pub stream_id: u64,
    #[topic]
    pub approver: Address,
    pub index: u32,
    pub amount: i128,
}

/// A stream was cancelled and both sides settled.
///
/// `recipient_balance` is left in the contract for the recipient to withdraw at
/// their leisure — cancellation freezes accrual, it does not claw back earned
/// money.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamCanceled {
    #[topic]
    pub stream_id: u64,
    pub refund_to_sender: i128,
    pub recipient_balance: i128,
    pub canceled_at: u64,
}

/// New stream creation was suspended until `paused_until`.
///
/// Contract-wide, and it reaches exactly one entry point. A client should render
/// this as "new streams are not being accepted" and never as anything touching
/// an existing stream, because it cannot.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Paused {
    pub paused_until: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Unpaused {
    pub at: u64,
}

/// The pauser role moved, or — when `pauser` is `None` — was given up for good.
///
/// A `None` here is the contract announcing it has become permanently
/// privilege-free. There is no upgrade path that could restore the role.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauserChanged {
    pub pauser: Option<Address>,
}
