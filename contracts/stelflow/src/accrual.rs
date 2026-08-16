//! The accrual maths.
//!
//! Every function here is pure — it reads a [`Stream`] and a timestamp and
//! returns amounts — which is what lets the property tests hammer it directly.
//!
//! `streamed` is recomputed from the original total on every call rather than
//! accumulated. Integer division truncates, but because the formula is
//! re-evaluated each time, truncation never compounds.

use soroban_sdk::contracttype;

use crate::error::Error;
use crate::types::{Milestone, MilestoneState, OnExpiry, Stream};

/// What a milestone's tranche does at a given instant.
///
/// Collapsing state, deadline and expiry policy into three outcomes is what
/// keeps the module honest: accrual, claimable and cancellation settlement are
/// all folds over the same resolution, so a milestone cannot mean one thing to
/// `withdraw` and another to `cancel`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Resolution {
    /// Counts toward `streamed_total`, and the recipient may claim it.
    Released,
    /// Counts toward `streamed_total` but is withheld from `claimable`.
    Withheld,
    /// Contributes nothing. The tranche belongs to the sender.
    Returned,
}

/// A `Met` milestone ignores its deadline: a deadline that could undo an
/// approval would be revocation through the back door.
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

/// Clamped into the stream window, and pinned to `canceled_at` once cancelled —
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
/// At or past `end` this returns the portion whole rather than evaluating the
/// formula, which is what makes a stream settle to exactly its deposit: it
/// sweeps up the remainder left by every intermediate truncation.
fn streamed(amount: i128, at: u64, stream: &Stream) -> Result<i128, Error> {
    if at >= stream.end {
        return Ok(amount);
    }
    let duration = stream.end.saturating_sub(stream.start) as i128;
    if duration == 0 {
        return Ok(amount);
    }
    let elapsed = at.saturating_sub(stream.start) as i128;
    amount
        .checked_mul(elapsed)
        .map(|scaled| scaled / duration)
        .ok_or(Error::Overflow)
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Position {
    pub streamed_total: i128,
    pub held: i128,
    pub claimable: i128,
}

/// `claimable = streamed_total - withdrawn - held`.
///
/// A withheld milestone lands in both `streamed_total` and `held`, so it nets
/// to zero against claimable while staying visible to a UI that wants to show
/// what is accruing behind the gate.
pub fn position(stream: &Stream, now: u64) -> Result<Position, Error> {
    let at = evaluation_time(stream, now);

    let mut streamed_total = streamed(stream.base_amount, at, stream)?;
    let mut held = 0i128;

    for milestone in stream.milestones.iter() {
        let accrued = streamed(milestone.amount, at, stream)?;
        match resolve(&milestone, now) {
            Resolution::Released => streamed_total = add(streamed_total, accrued)?,
            Resolution::Withheld => {
                streamed_total = add(streamed_total, accrued)?;
                held = add(held, accrued)?;
            }
            Resolution::Returned => {}
        }
    }

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

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Settlement {
    pub refund: i128,
    /// Left in the contract for the recipient to withdraw. Cancellation is not
    /// a clawback of earned money.
    pub recipient_balance: i128,
}

/// Splits a stream at cancellation per the rules in `docs/concepts.md`.
///
/// The sender recovers everything not yet accrued, plus the *whole* tranche of
/// any milestone that never opened — accrued part included.
pub fn settle(stream: &Stream, now: u64) -> Result<Settlement, Error> {
    let at = evaluation_time(stream, now);
    let base_streamed = streamed(stream.base_amount, at, stream)?;

    let mut refund = stream.base_amount - base_streamed;
    let mut recipient_earned = base_streamed;

    for milestone in stream.milestones.iter() {
        let accrued = streamed(milestone.amount, at, stream)?;
        match resolve(&milestone, now) {
            Resolution::Released => {
                refund = add(refund, milestone.amount - accrued)?;
                recipient_earned = add(recipient_earned, accrued)?;
            }
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

fn add(lhs: i128, rhs: i128) -> Result<i128, Error> {
    lhs.checked_add(rhs).ok_or(Error::Overflow)
}
