//! Error taxonomy.
//!
//! Distinct codes per failure so the SDK can render something better than
//! "transaction failed", and so tests assert on the *reason* a call was
//! rejected rather than merely that it was.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `initialize` has already run. There is no re-initialize: it would be an
    /// admin power over a live contract by another name.
    AlreadyInitialized = 1,
    NotInitialized = 2,

    // ---- create_stream ----
    /// `end` must be strictly greater than `start`; a zero-duration stream has
    /// no accrual rate.
    InvalidTimeRange = 3,
    /// The cliff must fall within `[start, end]`. A cliff after `end` would make
    /// the stream unclaimable until the moment it completes.
    InvalidCliff = 4,
    /// Amounts must be strictly positive.
    InvalidAmount = 5,
    /// Milestone amounts sum to more than the deposit, leaving a negative base.
    MilestonesExceedTotal = 6,
    /// Past `MAX_MILESTONES_PER_STREAM`. An unbounded vector inside a stored
    /// struct is a way to build a stream too expensive to ever withdraw from —
    /// threat-model T2.
    TooManyMilestones = 7,
    /// The token moved nothing, so there is no stream to create. Guards the
    /// measured-delta path against a token whose `transfer` silently no-ops.
    NoValueReceived = 8,

    // ---- lookup ----
    StreamNotFound = 9,

    // ---- withdraw ----
    /// Claimable is zero. Not an error condition in the moral sense, but the
    /// caller paid a fee for a state-changing call that changed nothing, and
    /// saying so is friendlier than a silent success.
    NothingToWithdraw = 10,

    // ---- approve_milestone ----
    MilestoneNotFound = 11,
    /// The tranche was returned to the sender by a cancellation. There is
    /// nothing left to release.
    MilestoneForfeited = 12,

    // ---- cancel ----
    /// Already cancelled. Accrual is frozen; a second cancel has nothing to do.
    AlreadyCanceled = 13,

    // ---- pause ----
    /// `create_stream` while paused. Note this is the *only* entry point that
    /// can return this error.
    Paused = 14,
    /// Caller is not the pauser, or the role has been renounced.
    NotPauser = 15,

    // ---- invariants ----
    /// A payout would have exceeded its own stream's remaining deposit. The
    /// contract's token balance is pooled across streams, so this is what stops
    /// one stream's accounting bug reaching another's money. Unreachable if the
    /// accrual maths is right — which is exactly why it is asserted.
    InsolventStream = 16,
    /// Arithmetic overflowed. `i128` against stroop-denominated amounts makes
    /// this effectively unreachable, and it is checked rather than assumed.
    Overflow = 17,
}
