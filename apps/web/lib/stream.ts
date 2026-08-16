/**
 * A faithful port of the contract's accrual maths.
 *
 * This exists so the interface can show a balance rising second by second
 * without an RPC round trip per tick. That only works if it agrees with the
 * chain exactly, so this file mirrors `contracts/stelflow/src/accrual.rs`
 * function for function — same clamping, same multiply-before-divide, same
 * end-of-stream special case, same three-way milestone resolution.
 *
 * Two rules keep it honest:
 *
 * 1. **BigInt throughout.** Stroop amounts exceed `Number.MAX_SAFE_INTEGER` at
 *    around 900,000 XLM, and floating-point money is how rounding bugs get
 *    shipped. Division truncates toward zero for positive operands, matching
 *    Rust's integer division.
 * 2. **This is a projection, never a source of truth.** Anything the user acts
 *    on — the amount a withdrawal will actually pay — comes from the contract.
 *    The projection only decides what number to paint between polls.
 */

import type { Milestone, Stream } from "./contract";

/** What a milestone's tranche does at a given instant. */
export type Resolution = "released" | "withheld" | "returned";

/** Mirrors `MilestoneState`, which the bindings surface as a u32. */
export const MILESTONE_UNMET = 0;
export const MILESTONE_MET = 1;
export const MILESTONE_FORFEITED = 2;

/** Mirrors `OnExpiry`. */
export const ON_EXPIRY_TO_RECIPIENT = 0;
export const ON_EXPIRY_TO_SENDER = 1;

export function resolveMilestone(milestone: Milestone, now: bigint): Resolution {
  if (milestone.state === MILESTONE_MET) return "released";
  if (milestone.state === MILESTONE_FORFEITED) return "returned";

  const expired = milestone.deadline !== 0n && now >= milestone.deadline;
  if (!expired) return "withheld";
  return milestone.on_expiry === ON_EXPIRY_TO_RECIPIENT ? "released" : "returned";
}

/** `evaluation_time` — clamped into the stream window, frozen at cancellation. */
function evaluationTime(stream: Stream, now: bigint): bigint {
  const unfrozen =
    stream.canceled_at === undefined ? now : min(now, stream.canceled_at);
  return clamp(unfrozen, stream.start, stream.end);
}

/**
 * `streamed` — linear accrual of one portion, floored.
 *
 * The `at >= end` branch returns the portion whole rather than evaluating the
 * formula. That is what makes a stream settle to exactly its deposit: it sweeps
 * up the remainder left by every intermediate truncation.
 */
function streamed(amount: bigint, at: bigint, stream: Stream): bigint {
  if (at >= stream.end) return amount;
  const duration = stream.end - stream.start;
  if (duration <= 0n) return amount;
  const elapsed = at > stream.start ? at - stream.start : 0n;
  return (amount * elapsed) / duration;
}

export interface Position {
  /** Accrued and not returned to the sender. */
  streamedTotal: bigint;
  /** The part of `streamedTotal` behind a shut gate. */
  held: bigint;
  /** Withdrawable right now. Never negative. */
  claimable: bigint;
}

/** `position` — the stream's state at one instant. */
export function positionAt(stream: Stream, now: bigint): Position {
  const at = evaluationTime(stream, now);

  let streamedTotal = streamed(stream.base_amount, at, stream);
  let held = 0n;

  for (const milestone of stream.milestones) {
    const accrued = streamed(milestone.amount, at, stream);
    switch (resolveMilestone(milestone, now)) {
      case "released":
        streamedTotal += accrued;
        break;
      case "withheld":
        streamedTotal += accrued;
        held += accrued;
        break;
      case "returned":
        break;
    }
  }

  // A cliff withholds claimability without touching accrual: the balance has
  // been building the whole time, it simply cannot be moved yet.
  const claimable =
    now < stream.cliff ? 0n : maxZero(streamedTotal - stream.withdrawn - held);

  return { streamedTotal, held, claimable };
}

/** `settle` — how a cancellation right now would divide the deposit. */
export function settlementAt(
  stream: Stream,
  now: bigint,
): { refund: bigint; recipientBalance: bigint } {
  const at = evaluationTime(stream, now);
  const baseStreamed = streamed(stream.base_amount, at, stream);

  let refund = stream.base_amount - baseStreamed;
  let recipientEarned = baseStreamed;

  for (const milestone of stream.milestones) {
    const accrued = streamed(milestone.amount, at, stream);
    if (resolveMilestone(milestone, now) === "released") {
      refund += milestone.amount - accrued;
      recipientEarned += accrued;
    } else {
      // Shut gate, or already returned: the tranche goes back whole.
      refund += milestone.amount;
    }
  }

  return { refund, recipientBalance: maxZero(recipientEarned - stream.withdrawn) };
}

// ---------------------------------------------------------------------------
// Presentation-only derivations. None of these affect an amount.
// ---------------------------------------------------------------------------

export type Phase =
  | "pending"
  | "cliff"
  | "streaming"
  | "completed"
  | "canceled";

export function phaseOf(stream: Stream, now: bigint): Phase {
  if (stream.canceled_at !== undefined) return "canceled";
  if (now < stream.start) return "pending";
  if (now >= stream.end) return "completed";
  if (now < stream.cliff) return "cliff";
  return "streaming";
}

/** Fraction of the stream's window elapsed, clamped to `[0, 1]`. */
export function elapsedFraction(stream: Stream, now: bigint): number {
  const at = evaluationTime(stream, now);
  const duration = stream.end - stream.start;
  if (duration <= 0n) return 1;
  return Number(at - stream.start) / Number(duration);
}

/**
 * The four parts of the deposit, as fractions summing to 1.
 *
 * Drives the stacked meter. Computed from the same figures the stat tiles show,
 * so the picture and the numbers can never disagree.
 */
export function depositBreakdown(stream: Stream, position: Position) {
  const total = stream.total;
  if (total <= 0n) {
    return { withdrawn: 0, claimable: 0, held: 0, remaining: 1 };
  }
  const asFraction = (value: bigint) => Number(value) / Number(total);
  const withdrawn = asFraction(stream.withdrawn);
  const claimable = asFraction(position.claimable);
  const held = asFraction(position.held);
  return {
    withdrawn,
    claimable,
    held,
    remaining: Math.max(0, 1 - withdrawn - claimable - held),
  };
}

/** Accrual rate in stroops per second, for a "+N / sec" readout. */
export function ratePerSecond(stream: Stream): bigint {
  const duration = stream.end - stream.start;
  if (duration <= 0n) return 0n;
  return stream.total / duration;
}

function min(a: bigint, b: bigint) {
  return a < b ? a : b;
}
function clamp(value: bigint, low: bigint, high: bigint) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
function maxZero(value: bigint) {
  return value > 0n ? value : 0n;
}
