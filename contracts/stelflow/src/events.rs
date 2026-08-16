//! Contract events — the product's read path, not a debugging aid.
//!
//! Soroban contracts cannot be queried historically from inside the chain, so
//! everything a client shows about the past is folded from this log.
//!
//! Two rules shape the set below. Every stream event carries `stream_id` as a
//! topic, so clients filter server-side. And events record *actions*, never the
//! passage of time — nothing fires when a cliff lapses, a deadline expires, or a
//! stream reaches `end`, because nothing happens on-chain at those instants.
//!
//! Note the topic derived from each struct name is **snake_case**:
//! `StreamCreated` publishes as `stream_created`.

use soroban_sdk::{contractevent, Address};

/// `total` is the measured amount that arrived, which for a fee-on-transfer
/// token is less than the sender asked to send.
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

/// Emitted at most once per milestone, ever — a repeat approval is absorbed
/// silently, so a fold never sees one approval twice.
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

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamCanceled {
    #[topic]
    pub stream_id: u64,
    pub refund_to_sender: i128,
    /// Stays in the contract for the recipient to withdraw at their leisure.
    pub recipient_balance: i128,
    pub canceled_at: u64,
}

/// Contract-wide, and it reaches exactly one entry point. A client should render
/// it as "new streams are not being accepted", never as anything touching an
/// existing stream.
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

/// A `None` here is the contract announcing it has become permanently
/// privilege-free.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauserChanged {
    pub pauser: Option<Address>,
}
