//! The accrual maths.
//!
//! Every number the contract pays out originates here, and every function in
//! this module is pure: it reads a [`Stream`] and a timestamp and returns
//! amounts. Nothing writes storage, moves tokens, or checks authorization, which
//! is what lets the property tests hammer it directly.
//!
//! Two invariants shape the whole module.
//!
//! **Recomputation, never accumulation.** `streamed` is derived from scratch on
//! every call rather than incremented. Integer division truncates, but because
//! the formula is re-evaluated against the original `total` each time, the
//! truncation never compounds — accrual picks those stroops up as it moves past
//! them. This is why `withdraw` can be called a thousand times without drift.
//!
//! **Multiply before divide.** `amount * elapsed / duration` and never
//! `amount * (elapsed / duration)`, which would floor the ratio to zero for
//! every stream shorter than its own duration.

use soroban_sdk::{contracttype, Vec};

use crate::error::Error;
use crate::types::{Milestone, MilestoneState, OnExpiry, Stream};

/// What a milestone's tranche does at a given instant.
///
/// Collapsing state, deadline, and expiry policy into three outcomes is what
/// keeps the rest of this module honest: accrual, claimable, and cancellation
/// settlement are all folds over the same resolution, so a milestone can never
/// mean one thing to `withdraw` and another to `cancel`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Resolution {
    /// Counts toward `streamed_total`, and the recipient may claim it.
    Released,
    /// Counts toward `streamed_total` but is withheld from `claimable` — the
    /// gate is shut. Accrual continues underneath it.
    Withheld,
    /// Contributes nothing. The tranche belongs to the sender.
    Returned,
}

/// Resolve a milestone against the ledger clock.
///
/// The deadline branch is the whole of the #38 decision: an unmet milestone past
/// its deadline resolves to the party named when the stream was created. An
/// already-`Met` milestone ignores its deadline entirely — a deadline that could
/// undo an approval would be revocation through the back door, and `Met` is
/// terminal.
pub fn resolve(milestone: &Milestone, now: u64) -> Resolution {
    match milestone.state {
        MilestoneState::Met => Resolution::Released,
        MilestoneState::Forfeited => Resolution::Returned,
        MilestoneState::Unmet => {
            let expired = milestone.deadline != 0 && now >= milestone.deadline;
            match (expired, milestone.on_expiry) {
                (false, _) => Resolution::Withheld,
                (true, OnExpiry::ToRecipient) => Resolution::Released,
                (true, OnExpiry::ToSender) => Resolution::Returned,
            }
        }
    }
}

/// The instant accrual is evaluated at.
///
/// Clamped into `[start, end]` so a stream neither accrues before it begins nor
/// past its own total, and pinned to `canceled_at` once a stream is cancelled —
/// cancellation freezes the clock rather than deleting the stream.
fn evaluation_time(stream: &Stream, now: u64) -> u64 {
    let unfrozen = match stream.canceled_at {
        Some(canceled_at) => core::cmp::min(now, canceled_at),
        None => now,
    };
    unfrozen.clamp(stream.start, stream.end)
}

/// Linear accrual of one portion, floored.
///
/// At or past `end` this returns the portion in full rather than evaluating the
/// formula. That is not an optimisation: it is what guarantees a stream settles
/// to exactly its deposit. `amount * duration / duration` would be exact in real
/// arithmetic, but the final withdrawal must land on the deposit to the stroop,
/// and special-casing the endpoint is how the remainder from every intermediate
/// truncation gets swept up.
fn streamed(amount: i128, at: u64, stream: &Stream) -> Result<i128, Error> {
    if at >= stream.end {
        return Ok(amount);
    }
    let elapsed = at.saturating_sub(stream.start) as i128;
    let duration = stream.end.saturating_sub(stream.start) as i128;
    if duration == 0 {
        return Ok(amount);
    }
    amount
        .checked_mul(elapsed)
        .map(|scaled| scaled / duration)
        .ok_or(Error::Overflow)
}

/// A stream's position at one instant.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Position {
    /// Everything that has accrued and not been returned to the sender.
    pub streamed_total: i128,
    /// The part of `streamed_total` sitting behind a shut gate.
    pub held: i128,
    /// What the recipient could withdraw right now. Never negative.
    pub claimable: i128,
}

/// Evaluate a stream at `now`.
///
/// `claimable = streamed_total - withdrawn - held`, which is the definition
/// carried in `docs/behaviour.md`. A withheld milestone lands in both
/// `streamed_total` and `held`, so it nets to zero against claimable while
/// remaining visible to a UI that wants to show what is accruing behind the gate.
pub fn position(stream: &Stream, now: u64) -> Result<Position, Error> {
    let at = evaluation_time(stream, now);

    let mut streamed_total = streamed(stream.base_amount, at, stream)?;
    let mut held = 0i128;

    for milestone in stream.milestones.iter() {
        let accrued = streamed(milestone.amount, at, stream)?;
        match resolve(&milestone, now) {
            Resolution::Released => {
                streamed_total = add(streamed_total, accrued)?;
            }
            Resolution::Withheld => {
                streamed_total = add(streamed_total, accrued)?;
                held = add(held, accrued)?;
            }
            Resolution::Returned => {}
        }
    }

    // A cliff withholds claimability without touching accrual. The balance is
    // building the whole time; it simply cannot be moved yet.
    let claimable = if now < stream.cliff {
        0
    } else {
        (streamed_total - stream.withdrawn - held).max(0)
    };

    Ok(Position {
        streamed_total,
        held,
        claimable,
    })
}

/// How a cancellation divides the remaining deposit.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Settlement {
    /// Paid to the sender immediately, in the cancelling transaction.
    pub refund: i128,
    /// Left in the contract, frozen, for the recipient to withdraw whenever they
    /// choose. Cancellation is not a clawback of earned money.
    pub recipient_balance: i128,
}

/// Split a stream at cancellation, per the four rules in
/// `docs/concepts.md#cancellation-and-clawback`.
///
/// The sender gets back every portion that has not yet accrued, plus the *whole*
/// tranche of any milestone that never opened — accrued part included, on the
/// reasoning that an unmet milestone is work that did not happen.
pub fn settle(stream: &Stream, now: u64) -> Result<Settlement, Error> {
    let at = evaluation_time(stream, now);

    let base_streamed = streamed(stream.base_amount, at, stream)?;
    let mut refund = stream.base_amount - base_streamed;
    let mut recipient_earned = base_streamed;

    for milestone in stream.milestones.iter() {
        let accrued = streamed(milestone.amount, at, stream)?;
        match resolve(&milestone, now) {
            // Open gate: the sender recovers only what has not yet streamed.
            Resolution::Released => {
                refund = add(refund, milestone.amount - accrued)?;
                recipient_earned = add(recipient_earned, accrued)?;
            }
            // Shut gate, or already returned: the tranche goes back whole.
            Resolution::Withheld | Resolution::Returned => {
                refund = add(refund, milestone.amount)?;
            }
        }
    }

    Ok(Settlement {
        refund,
        recipient_balance: (recipient_earned - stream.withdrawn).max(0),
    })
}

/// Sum of every milestone amount, used to derive `base_amount` at creation.
pub fn gated_total(milestones: &Vec<Milestone>) -> Result<i128, Error> {
    let mut sum = 0i128;
    for milestone in milestones.iter() {
        sum = add(sum, milestone.amount)?;
    }
    Ok(sum)
}

fn add(lhs: i128, rhs: i128) -> Result<i128, Error> {
    lhs.checked_add(rhs).ok_or(Error::Overflow)
}
