# Design decision: milestone deadlines

Answers [issue #38](https://github.com/StelFlow-labs/StelFlow/issues/38), the last of the
[threat model](threat-model.md)'s open design changes and the mitigation for
[T3](threat-model.md#t3--an-approver-who-never-comes-back).

**Decision: milestones may carry an optional deadline, with the resolution declared at creation.**

A milestone with `deadline = 0` behaves exactly as milestones did before this decision — it waits
indefinitely for its approver. A milestone with a deadline resolves automatically once the ledger
passes it, to whichever party the *sender chose and the recipient saw* before either of them signed.

## Why this had to be decided now

[Issue #33](upgradeability-and-pause.md) settled that StelFlow ships non-upgradeable. That turned this
question from one that could wait into one that could not, and the reasoning is worth stating plainly
because it is the whole justification for adding a field to the hottest struct in the contract:

**A recovery path cannot be retrofitted onto a stream that already exists.** Every stream created
before deadlines exist is permanently a stream without one. There is no upgrade that adds the field
later, no migration that rewrites a live stream's terms, and no admin who could intervene. Deferring
the decision *is* deciding it, in the direction that cannot be reversed.

That asymmetry — one answer is revisable and the other is permanent — is what settles it. Adding an
optional field that defaults to today's behaviour costs storage and can be left unused forever.
Omitting it forecloses the option for the life of the contract.

## What the alternatives were

From T3, in the order the threat model argued them:

**1. A per-milestone deadline with a declared default** — this decision. Resolution is a *term of the
stream*, agreed at creation, not a privilege anyone exercises later.

**2. A fallback approver, or k-of-n approvers.** Rejected, and it is the closest call. It removes the
single point of failure properly rather than working around it, and for a grant committee it models
reality better than a timeout does. But it multiplies the milestone struct by the number of fallback
approvers — an `Address` is 32 bytes plus discriminant, against the 25 bytes this decision adds for
*all* milestones — and it pushes directly against the `MAX_MILESTONES_PER_STREAM` cap that
[T2](threat-model.md#t2--resource-exhaustion-as-denial-of-withdrawal) exists to protect. It also
fails the case it is meant to solve whenever the fallback is as unreachable as the primary, which for
a folded company is the common case rather than the unlucky one. Nothing stops a stream from naming a
multisig or a contract as its single approver, which buys most of this at zero storage cost.

**3. Do nothing, and disclose it.** This was defensible when the contract might later be patched.
Under #33 it means accepting permanently that a vanished approver strands a tranche forever on every
non-cancelable stream. The disclosure would have to read *"if your approver disappears, this money is
gone and nothing can recover it"* — and a design whose honest disclosure reads like that should
change rather than disclose harder.

## The question that actually decides the shape

> If a deadline expires, who gets the tranche — the sender or the recipient?

Both are defensible, and that is precisely why **neither is hardcoded.**

Sender-default treats an unapproved milestone as work that did not happen, which is what
[cancellation rule 4](concepts.md#cancellation-and-clawback) already assumes. Recipient-default treats
a vanished approver as the *sender's* counterparty risk — the sender chose that approver — and refuses
to let the sender benefit from their own bad pick.

The mistake would be picking one and calling it fair, because the right answer differs by use case. A
grant program that names an external committee should not have the recipient's pay depend on that
committee's diligence. A vesting stream gated on a performance condition should not pay out because
nobody looked. So:

**`on_expiry` is set per milestone at creation, and is visible to both parties before either signs.**
It is a negotiated term, like the amount or the schedule, and it keeps the property that
[architecture.md](architecture.md#authorization) insists on: nobody holds a discretionary power over
someone else's funds. Expiry is not an action anyone takes. It is the passage of time, and its outcome
was agreed in advance by both of the people it affects.

## The rules

1. **`deadline` is an absolute ledger timestamp**, in the same units as `start` and `end`. Zero means
   no deadline — indefinite wait, matching pre-#38 behaviour exactly.
2. **A deadline must fall at or after the stream's `end`.** This is the non-obvious constraint and it
   matters. A deadline *before* `end` would resolve a tranche while it was still accruing, which
   makes `streamed_total` non-monotonic and puts the approver in a race against the clock for a
   milestone they may be about to approve legitimately. Requiring `deadline >= end` means expiry only
   ever resolves a tranche that has finished accruing, so the amount at stake is the whole tranche and
   nothing is mid-flight.
3. **Expiry is evaluated on read, never pushed.** Like accrual itself, nothing happens on-chain at the
   deadline. The next call that touches the stream observes `now >= deadline` and computes
   accordingly. No keeper, no cron, no transaction anyone must remember to send.
4. **An approved milestone ignores its deadline entirely.** `Met` is terminal
   ([#17](milestone-revocation.md)); a deadline that could undo an approval would be revocation
   through the back door, and every argument against revocation applies unchanged.
5. **`on_expiry = ToRecipient`** makes the tranche behave as though approved, at expiry. It stops
   being `held` and becomes ordinary claimable balance.
6. **`on_expiry = ToSender`** makes the tranche behave as though forfeited. It leaves
   `streamed_total`, and `cancel` — or the stream simply ending — returns it to the sender.
7. **Cancellation still overrides.** Cancelling before a deadline resolves the milestone under rule 4
   as it always did. A cancelled stream's milestones never expire, because they are already resolved.

## What this costs

Two fields per milestone: a `u64` deadline and a one-byte enum, so **25 bytes** against a milestone
that already carries an `i128` amount, an `Address` approver, and a state byte.

That is real, and it is the reason option 2 was rejected — but it is a fixed cost, not a multiplier,
and it does not scale with the number of approvers or the stream's history.
[T2](threat-model.md#t2--resource-exhaustion-as-denial-of-withdrawal)'s rule that *withdrawal cost
never grows with a stream's history* is untouched: expiry is computed from two stored numbers and the
current timestamp, exactly like accrual, with no log to walk and no new entry to read.

The effect on `MAX_MILESTONES_PER_STREAM` is measured rather than estimated — see
[architecture.md](architecture.md#the-per-transaction-read-budget) for the figure and how it was
derived.

## What this still gives up

- **A deadline is a guess made at creation.** Set it too short and a legitimate approver misses it
  through ordinary delay; too long and the funds are stranded for most of that time anyway. The SDK
  should default to something conservative and make the trade visible rather than hiding it behind a
  sensible-looking number.
- **It does not help a stream created without one.** Streams with `deadline = 0` keep T3 in full.
  This closes the hole for streams created from here on; it cannot reach backwards, which is the
  entire reason it had to be decided before any stream existed.
- **It does not adjudicate.** Like [unanimous-consent cancel](upgradeability-and-pause.md), expiry
  moves money to a pre-agreed party rather than to the deserving one. If the recipient did the work
  and `on_expiry` was `ToSender`, they lose the tranche. What they get instead is *knowing that in
  advance*, which is the most a contract can offer without becoming an arbiter.

## Consequences for the rest of the design

- **Storage.** `Milestone` gains `deadline: u64` and `on_expiry: OnExpiry`. Milestone state stays
  monotonic — expiry resolves a milestone, it never returns one to `Unmet`.
- **`claimable` stays non-decreasing in time** under `ToRecipient`, and drops by the tranche under
  `ToSender` at the deadline — the only point in the design where a pending amount leaves the
  recipient's side, and it does so at a timestamp they agreed to.
- **Validation at creation.** `deadline == 0 || deadline >= end`, rejected otherwise.
- **Events.** No event fires at expiry, because no transaction occurs. The indexer derives expiry the
  same way the contract does: from the stored deadline and the ledger clock. This keeps the events log
  a record of *actions*, never of the passage of time.
- **T3 status** moves to **Mitigated for streams that use it**, which is the honest ceiling for a
  mechanism that is opt-in by design.

## Next

- [threat-model.md](threat-model.md) — T3, which this closes as far as it can be closed.
- [upgradeability-and-pause.md](upgradeability-and-pause.md) — why this was now-or-never.
- [milestone-revocation.md](milestone-revocation.md) — the same mechanism pointed the other way, and
  rejected.
- [behaviour.md](behaviour.md) — the expiry scenarios.
