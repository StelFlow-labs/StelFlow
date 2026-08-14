# Design decision: milestone revocation

Answers [issue #17](https://github.com/StelFlow-labs/StelFlow/issues/17).

**Decision: a met milestone cannot be revoked. Milestone state is monotonic and `Met` is terminal.**

The reasoning is below, including the arithmetic that rules out the most plausible alternative and an
honest account of what this decision gives up.

## The question

Once an approver marks a milestone met, can they un-mark it? And if the recipient has already
withdrawn against the unlocked portion, what happens to that money?

The second half is what makes this hard. Withdrawn funds have left the contract. No revocation
mechanism can reach into the recipient's account and take them back, so any design has to decide what
a revocation *means* when the money it would have gated is already gone.

## Options considered

### Option A — no revocation; `Met` is terminal

The approver's only power is to release. Once released, released.

### Option B — revocation re-locks the tranche; prior withdrawals stand

The milestone returns to `Unmet`, its accrual is `held` again, and the recipient's future claimable is
reduced accordingly. Money already withdrawn is not pursued.

### Option C — revocation permitted only while nothing has been withdrawn against the unlocked portion

A window that closes the moment the recipient acts.

### Option D — no revocation, but pre-declared mechanisms handle the underlying needs

Option A, plus milestone deadlines and cancelability covering the cases people reach for revocation
to solve.

## Why not Option B — the arithmetic

Option B is the intuitive one, and it is the one to rule out carefully, because "prior withdrawals
stand, future accrual adjusts" *sounds* fair.

Run it against the [worked example](../concepts.md#a-worked-example-alice-and-bob). Alice streams
30,000,000,000 stroops to Bob over 30 days: 18,000,000,000 base, 12,000,000,000 gated on one
milestone. Bob withdraws 6,000,000,000 at day 10. The milestone is approved at day 18 and Bob
withdraws the full 12,000,000,000 then, putting `withdrawn` at 18,000,000,000 — exactly the sequence
`concepts.md` walks through.

Now the approver revokes at day 19. The tranche is `held` again, and
`claimable = streamed_total − withdrawn − held`:

| Day | `streamed_total` | `held` | `claimable` |
|---:|---:|---:|---:|
| 19 | 19,000,000,000 | 7,600,000,000 | **−6,600,000,000** |
| 22 | 22,000,000,000 | 8,800,000,000 | **−4,800,000,000** |
| 26 | 26,000,000,000 | 10,400,000,000 | **−2,400,000,000** |
| 30 | 30,000,000,000 | 12,000,000,000 | **0** |

Claimable goes negative and stays there for the rest of the stream, arriving at exactly zero on the
final day. Clamped at zero, as any implementation would have to, **Bob receives nothing for the
remaining twelve days** — and the base tranche was never gated. He earned that money on the clock
alone.

This is the argument. Option B lets a milestone decision reach across tranche boundaries and cancel
income the milestone never governed. The mechanism is subtraction: `withdrawn` is a single
stream-wide counter, so re-imposing `held` after a withdrawal has settled charges the shortfall
against whatever the recipient's other tranches earn next. There is no version of Option B that
avoids this while keeping one `withdrawn` counter, and splitting `withdrawn` per tranche is a
significant storage and complexity cost to buy a power the rest of this document argues against
anyway.

Worth naming precisely what a recipient experiences: they withdrew money they were unambiguously
entitled to at the moment they withdrew it, and a later act by a third party retroactively converted
that entitlement into a debt against their future earnings. A contract that can do that is not one
whose guarantees can be reasoned about at signing time.

## Why not Option C — it is a race

Restricting revocation to "before anything is withdrawn" avoids negative claimable, and fails for a
different reason: it makes the outcome depend on who submits a transaction first.

The approver revokes; the recipient withdraws; whichever lands in the earlier ledger wins. That
rewards whoever is running a bot rather than whoever is right, and Stellar's few-second ledger close
means the window is short enough that a human recipient reliably loses to a watching approver. It
also inverts abruptly: a single stroop withdrawn locks revocation out permanently, so the rule is
either irrelevant or decisive with nothing in between.

Racing is an acceptable mechanism for allocating something neutral. It is not an acceptable
mechanism for deciding whether someone keeps their pay.

## Why Option A, and what it protects

Three reasons, in order of weight.

**1. It is the only option that keeps the promise the design is sold on.**

[`concepts.md`](../concepts.md#what-a-gate-does-not-do) states that a gate "does not give the
approver custody — the approver flips a flag. They cannot redirect funds." Under Option A that claim
is not just true, it is *structurally* true: the approver's single power moves value in one direction
only, toward the recipient, and can never move it back. Under Option B or C the approver can reduce
what the recipient ultimately receives, which is custody in substance regardless of what it is called,
and the sentence would need amending to something much weaker.

The broader promise in [the comparison table](../concepts.md#how-this-differs-from-what-already-exists)
is that the recipient is funded while conditions pend. A retraction power inverts that: the recipient
would be funded *provisionally* while conditions pend, and would not know for certain what they had
earned until the stream ended.

**2. Monotonic state is dramatically cheaper, in the place cost hurts most.**

A terminal `Met` is a small enum. A revocable milestone needs, at minimum: the state, the amount
released under each approval, and a revocation counter so the
[indexer](indexer-design.md) can reconstruct history from events. That is per milestone, inside the
stream struct, which is exactly the storage that
[threat-model T2](threat-model.md#t2--resource-exhaustion-as-denial-of-withdrawal) identifies as the
path to a stream that can never be withdrawn from, and that
[T8](threat-model.md#t8--archival-economics-as-a-griefing-vector) identifies as the driver of
restoration cost. Growing the milestone struct lowers `MAX_MILESTONES_PER_STREAM` and raises the rent
and restore cost of every stream that uses milestones at all.

It also keeps the indexer honest. `milestone_transitions` stays an append-only log of a monotonic
state machine, and `claimable` remains non-decreasing in approvals — which means a projection can
never need to walk backwards.

**3. The needs behind "revocation" are better served by other mechanisms.**

Four distinct needs get bundled into the word:

| Need | Better answer |
|---|---|
| Approval submitted by mistake | Deliberate approval UX and, if warranted, an approver that is a multisig or contract rather than one key |
| Approver key compromised | Bounded by design already — see below |
| Work later found to be fraudulent | A dispute process, which belongs in an escrow, not in a streaming contract |
| Approver never approves at all | A **deadline**, not a retraction — [threat-model T3](threat-model.md#t3--an-approver-who-never-comes-back) |

The compromise case is worth spelling out because it is the one that sounds most alarming.
[T9](threat-model.md#t9--a-compromised-approver) works it through: approval does not accelerate
accrual, it only unlocks what has already streamed, and the unlocked funds go to the **recipient**,
not to the attacker. Compromising an approver spends a stolen key to pay a third party early. The
sender's exposure is bounded by tranches that have already accrued, and there is no path to
redirection. That is a materially smaller problem than a revocation power would create.

The fraud case is the one Option A genuinely cannot handle, and the honest answer is that it was never
StelFlow's to handle. [`architecture.md`](../architecture.md#trustless-work-integration) already draws
the line: Trustless Work decides *whether* a condition is met, StelFlow decides *how fast* money moves
once it is. Trustless Work implements disputes. A grant program that needs a dispute process should
name a Trustless Work escrow as the approver, and that escrow can hold its approval until its own
process concludes — which is revocation's real use case, solved by not approving yet, in the contract
that has the machinery for it.

## What this decision gives up

Stated plainly rather than buried:

- **There is no in-protocol remedy for an approval that turns out to be wrong.** If an approver
  releases a tranche and the work is later shown to be fraudulent, StelFlow offers nothing. Recovery
  is a matter for whatever agreement sits outside the contract.
- **The approver has one irreversible action and no undo.** That is a real UX hazard, and it moves
  work to the SDK, which must make approval unmistakably final at the point of signing — naming the
  milestone, the amount that will unlock immediately, and the fact that it cannot be reversed.
- **A sender who wants a retraction path must use a cancelable stream**, and accept that cancellation
  is coarser: it ends the whole stream rather than one tranche.

These are acceptable. The alternative is a contract where a recipient cannot know at signing time what
they are guaranteed, and that cost is larger and falls on the party with less power.

## Consequences for the rest of the design

- **Storage.** Milestone state is an enum with no reverse transition. No per-milestone released-amount
  field, no revocation counter. The stream struct stays as small as the design already assumed.
- **`claimable` is non-decreasing in approvals** and can never be driven negative by a milestone
  action. Implementations should still clamp, but only as defence against a bug, not against a
  reachable state.
- **Events.** One `milestone_approved` event per milestone, at most once. The indexer's fold does not
  need to handle a reversal.
- **Related decision, not made here.** Whether a *second* `approve_milestone` call on an already-met
  milestone reverts or is a no-op is [issue #32](https://github.com/StelFlow-labs/StelFlow/issues/32),
  case 1. This decision constrains it — with `Met` terminal there is no state change to make, so the
  question is purely about which failure signal is friendlier — but the call belongs to that issue.
- **Still open.** [T3](threat-model.md#t3--an-approver-who-never-comes-back) is untouched by this and
  gets more urgent because of it: with no revocation and no deadline, a non-cancelable stream whose
  approver disappears has no recovery path for anyone. Deciding deadlines is now the outstanding half
  of the milestone lifecycle.

## Next

- [../concepts.md](../concepts.md#milestone-gates) — where the rule is stated for readers.
- [threat-model.md](threat-model.md) — T3 and T9, which this decision leans on.
- [../specs/behaviour.md](../specs/behaviour.md) — the scenarios this makes writable.
