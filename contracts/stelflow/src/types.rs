//! Storage types.
//!
//! Layout follows `docs/architecture.md#storage-type-and-ttl`: one persistent
//! entry per stream, with milestones stored *inside* the stream struct rather
//! than as separate keyed entries, so a withdrawal reads one entry regardless of
//! how many milestones a stream has.

use soroban_sdk::{contracttype, Address, Vec};

/// Milestone lifecycle. Monotonic: there is no transition back to `Unmet`.
///
/// `Met` being terminal is the decision in `docs/research/milestone-revocation.md`
/// — re-locking a tranche after a withdrawal has settled would charge the
/// shortfall against the recipient's *other* tranches, because `withdrawn` is a
/// single stream-wide counter.
///
/// `Forfeited` is not a revocation. It is only reachable through `cancel`, which
/// returns an unapproved tranche to the sender in full, and it exists so that a
/// forfeited tranche stops contributing to both `streamed_total` and `held`
/// rather than being silently special-cased at every read site.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MilestoneState {
    Unmet = 0,
    Met = 1,
    Forfeited = 2,
}

/// Where a milestone's tranche goes if its deadline passes unapproved.
///
/// Deliberately not hardcoded either way. A grant program naming an external
/// committee should not make the recipient's pay hostage to that committee's
/// diligence; a performance-gated vest should not pay out because nobody looked.
/// The right answer differs by use case, so it is a term agreed at creation and
/// visible to both parties before either signs — never a privilege anyone
/// exercises later. See `docs/milestone-deadlines.md`.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OnExpiry {
    /// The tranche unlocks as though it had been approved.
    ToRecipient = 0,
    /// The tranche is forfeited back to the sender, as an unmet milestone is on
    /// cancellation.
    ToSender = 1,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Milestone {
    /// Portion of the stream's total gated behind this milestone, in stroops.
    pub amount: i128,
    /// The only address that can mark this milestone met. May be a contract —
    /// that is how a Trustless Work escrow acts as approver.
    pub approver: Address,
    pub state: MilestoneState,
    /// Absolute ledger timestamp after which this milestone resolves without an
    /// approver. Zero means no deadline: wait indefinitely.
    ///
    /// Constrained to `>= stream.end` at creation. A deadline before `end` would
    /// resolve a tranche that was still accruing, which makes `streamed_total`
    /// non-monotonic and races a legitimate approver against the clock.
    pub deadline: u64,
    pub on_expiry: OnExpiry,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Stream {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    /// SEP-41 token contract. Any classic Stellar asset works via its SAC.
    pub token: Address,
    /// The **measured** deposit: the contract's own balance delta across the
    /// creation transfer, not the amount the sender asked for. Decided in #32 —
    /// this is what makes the stream's accounting true by construction for a
    /// fee-on-transfer token. See `docs/specs/behaviour.md`.
    pub total: i128,
    /// Ungated portion: `total` minus the sum of all milestone amounts.
    pub base_amount: i128,
    pub start: u64,
    pub end: u64,
    /// Absolute timestamp before which `claimable` evaluates to zero. Equal to
    /// `start` when the stream has no cliff. Accrual still runs during a cliff;
    /// only claimability is withheld.
    pub cliff: u64,
    /// Whether the sender may cancel *alone*. When false, `cancel` requires the
    /// recipient's authorization alongside the sender's — it does not mean the
    /// stream can never be cancelled. See `docs/research/upgradeability-and-pause.md`.
    pub cancelable: bool,
    /// Cumulative, stream-wide. Never decreases.
    pub withdrawn: i128,
    pub milestones: Vec<Milestone>,
    /// Ledger timestamp at which accrual froze, or `None` while the stream is
    /// live. Accrual is evaluated against `min(now, canceled_at)`.
    pub canceled_at: Option<u64>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Per-stream state. Persistent storage: each stream's TTL is independent,
    /// so one stream archiving blocks only that stream.
    Stream(u64),
}

/// Instance-storage keys. Instance storage shares one TTL across the whole
/// contract, so losing it would block *every* stream at once — it is extended
/// unconditionally on every call that touches it.
#[contracttype]
#[derive(Clone)]
pub enum ConfigKey {
    /// Monotonic stream-id counter. Settles architecture.md open question 1 in
    /// favour of a counter over a parameter hash: readable ids matter for a UI,
    /// and the write-contention cost is one instance entry that every creation
    /// already touches.
    NextId,
    /// The one global role. `None` once renounced, permanently — there is no
    /// upgrade path that could restore it.
    Pauser,
    /// Ledger timestamp at which an active pause lifts by itself. Zero or past
    /// means not paused. A pause that could outlive its key would be permanent
    /// in a non-upgradeable contract, hence expiry rather than a bare flag.
    PausedUntil,
}
