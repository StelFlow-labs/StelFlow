use soroban_sdk::{contracttype, Address, Vec};

/// Milestone lifecycle. Monotonic — there is no transition back to `Unmet`.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MilestoneState {
    Unmet = 0,
    Met = 1,
    /// Reachable only through `cancel`, which returns an unapproved tranche to
    /// the sender in full.
    Forfeited = 2,
}

/// Where a milestone's tranche goes if its deadline passes unapproved.
///
/// Not hardcoded either way: a grant should resolve to the recipient, since the
/// funder chose the approver, while a performance-gated vest should resolve to
/// the sender. See `docs/milestone-deadlines.md`.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OnExpiry {
    ToRecipient = 0,
    ToSender = 1,
}

/// What a caller supplies when creating a stream.
///
/// Deliberately not [`Milestone`]: without a `state` field, a milestone that
/// starts already met is unrepresentable rather than merely rejected.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MilestoneSpec {
    pub amount: i128,
    pub approver: Address,
    /// Absolute timestamp, or zero for no deadline. Must be `>= end`.
    pub deadline: u64,
    pub on_expiry: OnExpiry,
}

impl MilestoneSpec {
    pub fn into_milestone(self) -> Milestone {
        Milestone {
            amount: self.amount,
            approver: self.approver,
            state: MilestoneState::Unmet,
            deadline: self.deadline,
            on_expiry: self.on_expiry,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Milestone {
    pub amount: i128,
    /// May be a contract, which is how an escrow can act as approver.
    pub approver: Address,
    pub state: MilestoneState,
    /// Constrained to `>= stream.end` at creation, so expiry never resolves a
    /// tranche that is still accruing.
    pub deadline: u64,
    pub on_expiry: OnExpiry,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Stream {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    /// The measured deposit: the contract's own balance delta across the
    /// creation transfer, not the amount requested.
    pub total: i128,
    /// `total` minus the sum of all milestone amounts.
    pub base_amount: i128,
    pub start: u64,
    pub end: u64,
    /// Absolute timestamp before which `claimable` is zero. Equal to `start`
    /// when there is no cliff. Accrual runs throughout; only claimability waits.
    pub cliff: u64,
    /// Whether the sender may cancel *alone*. When false, `cancel` additionally
    /// requires the recipient's authorization.
    pub cancelable: bool,
    pub withdrawn: i128,
    pub milestones: Vec<Milestone>,
    /// Timestamp accrual froze at, or `None` while live.
    pub canceled_at: Option<u64>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Stream(u64),
}

#[contracttype]
#[derive(Clone)]
pub enum ConfigKey {
    NextId,
    /// `None` once renounced, permanently.
    Pauser,
    /// Timestamp an active pause lifts at. Expiry exists because a pause that
    /// outlived its key would be permanent in a non-upgradeable contract.
    PausedUntil,
}
