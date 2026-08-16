use soroban_sdk::contracterror;

/// One code per failure, so the SDK can say *why* rather than "transaction
/// failed", and tests can assert on the reason.
///
/// Codes 1 and 2 were `AlreadyInitialized` / `NotInitialized`, both unreachable
/// once setup moved into `__constructor`. Left unused rather than reassigned: a
/// code must never change meaning between builds.
#[contracterror]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidTimeRange = 3,
    InvalidCliff = 4,
    InvalidAmount = 5,
    MilestonesExceedTotal = 6,
    /// Past `MAX_MILESTONES_PER_STREAM`. An unbounded vector inside a stored
    /// struct is a way to build a stream too expensive to ever withdraw from.
    TooManyMilestones = 7,
    /// The token moved nothing, so there is no stream to create.
    NoValueReceived = 8,

    StreamNotFound = 9,
    /// Claimable is zero. Reported rather than silently succeeding, because the
    /// caller paid a fee for a state change that did not happen.
    NothingToWithdraw = 10,

    MilestoneNotFound = 11,
    MilestoneForfeited = 12,
    AlreadyCanceled = 13,

    /// Returned only by `create_stream` — no other entry point is pausable.
    Paused = 14,
    NotPauser = 15,

    /// A payout would have exceeded its own stream's remaining deposit. The
    /// contract's token balance is pooled, so this is what keeps one stream's
    /// accounting from reaching another's money. Unreachable if the accrual
    /// maths is right, which is why it is asserted rather than assumed.
    InsolventStream = 16,
    Overflow = 17,
}
