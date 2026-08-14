# Behaviour specs: create_stream, withdraw, cancel, approve_milestone

Given/When/Then scenarios for the four entry points, written against the semantics in
[docs/concepts.md](../concepts.md) and [docs/architecture.md](../architecture.md). None of this is
implemented — this is the checklist the eventual `#[test]` functions turn into, and a place to argue
with the design before code makes arguing expensive.

Conventions used throughout:

- All amounts are in stroops (the asset's smallest unit), never display units.
- `now` is the ledger's `timestamp()`, always clamped to `[start, end]` before use.
- `elapsed = clamp(now, start, end) - start`, `duration = end - start`.
- `streamed(portion) = portion.amount * elapsed / duration`, rounded down, except at `now >= end`
  where `streamed(portion) = portion.amount` exactly (the end-of-stream case is special-cased to the
  remaining balance rather than the formula, per [architecture.md#arithmetic](../architecture.md#arithmetic)).
- `held = sum of streamed(m) for every unapproved milestone m`.
- `claimable = streamed(base) + sum(streamed(m) for approved m) - withdrawn - held`, which reduces to
  `claimable = streamed_total - withdrawn - held`.
- **The invariant that must hold after every state-changing call:** `deposit == withdrawn + refunded +
remaining_in_contract`. Every scenario below that changes state asserts this explicitly.
- Every entry point calls `require_auth` on a specific address (see
  [architecture.md#authorization](../architecture.md#authorization)). Every scenario states who is
  calling and asserts unauthorized callers are rejected without side effects.

Streams in these scenarios are kept small and, where possible, evenly divisible, so the arithmetic can
be checked by hand. Scenarios that exist specifically to exercise rounding or degenerate durations say
so and use awkward numbers on purpose.

---

## Feature: create_stream

### Scenario: happy path — a simple two-party stream

```gherkin
Given an authenticated sender with 1,000,000 stroops of a SEP-41 asset, approved for transfer to StelFlow Core
And a recipient address
And start = 1,000 and end = 11,000 (duration 10,000 seconds)
And no milestones
When the sender calls create_stream(token, recipient, total=1,000,000, start=1,000, end=11,000, cancelable=true)
Then the call succeeds
And 1,000,000 stroops move from the sender to the contract via transfer_from
And the contract stores token, total=1,000,000, start=1,000, end=11,000, withdrawn=0, cancelable=true
And a stream-created event is emitted
And deposit (1,000,000) == withdrawn (0) + refunded (0) + remaining_in_contract (1,000,000)
```

### Scenario: caller must be the sender — create_stream is not callable on someone else's behalf

```gherkin
Given an address A with funds and an address B without A's authorization
When B calls create_stream with A as the funding source but does not supply A's authorization
Then the call is rejected before any funds move
And no stream is stored and no event is emitted
```

### Scenario: create_stream with a base tranche and one milestone tranche

```gherkin
Given a sender, a recipient, and an approver
And start = 0 and end = 2,592,000 (30 days)
And a base tranche of 1,800,000 stroops (time-gated only)
And one milestone tranche of 1,200,000 stroops, approver = the named approver, state = unmet
When the sender calls create_stream with these portions, totalling 3,000,000
Then the call succeeds
And 3,000,000 stroops move from the sender to the contract
And the stream stores both tranches, each running on the same start/end/duration
And deposit (3,000,000) == withdrawn (0) + refunded (0) + remaining_in_contract (3,000,000)
```

### Scenario: rejected — end does not exceed start

```gherkin
Given a sender with sufficient funds
When the sender calls create_stream with start = 5,000 and end = 5,000
Then the call is rejected
And no funds move
```

### Scenario: rejected — end is before start

```gherkin
Given a sender with sufficient funds
When the sender calls create_stream with start = 5,000 and end = 1,000
Then the call is rejected
And no funds move
```

### Scenario: rejected — a milestone's cliff falls after the stream's end

```gherkin
Given a sender with sufficient funds
And start = 0 and end = 1,000
When the sender calls create_stream with a cliff at 1,500
Then the call is rejected
And no funds move
```

### Scenario: a stream of duration 1 second

```gherkin
Given a sender with 7 stroops and a recipient
And start = 100 and end = 101 (duration 1 second)
When the sender calls create_stream(total=7, start=100, end=101)
Then the call succeeds and 7 stroops are pulled from the sender
And at now = 100, elapsed = 0, streamed = 0
And at now = 101 (or later), elapsed clamps to 1, streamed = 7 (the end-of-stream case, not 7*1/1 evaluated mid-stream)
And deposit (7) == withdrawn (0) + refunded (0) + remaining_in_contract (7)
```

### Scenario: a stream of amount 1 stroop

```gherkin
Given a sender with 1 stroop and a recipient
And start = 0 and end = 1,000,000 (duration 1,000,000 seconds)
When the sender calls create_stream(total=1, start=0, end=1,000,000)
Then the call succeeds and 1 stroop is pulled from the sender
And for every now with elapsed < duration, streamed = 1 * elapsed / 1,000,000 = 0 (integer division floors to zero)
And at now >= end, streamed = 1 exactly (end-of-stream special case)
And deposit (1) == withdrawn (0) + refunded (0) + remaining_in_contract (1)
```

### Scenario: a stream whose total does not divide evenly by its duration

```gherkin
Given a sender with 100 stroops and a recipient
And start = 0 and end = 3 (duration 3 seconds) — 100 / 3 is not an integer
When the sender calls create_stream(total=100, start=0, end=3)
Then the call succeeds
And at now = 1, elapsed = 1, streamed = 100 * 1 / 3 = 33 (floored, 1 stroop of "true" accrual left on the table)
And at now = 2, elapsed = 2, streamed = 100 * 2 / 3 = 66 (still floored — the shortfall does not compound)
And at now = 3 (= end), streamed = 100 exactly (end-of-stream special case collects the remainder)
And deposit (100) == withdrawn (0) + refunded (0) + remaining_in_contract (100)
```

---

## Feature: withdraw

### Scenario: happy path — partial withdrawal mid-stream

```gherkin
Given a stream: total=1,000,000, start=0, end=10,000, no milestones, withdrawn=0
And now = 4,000 (elapsed 4,000 of 10,000)
When the recipient calls withdraw()
Then streamed = 1,000,000 * 4,000 / 10,000 = 400,000
And claimable = 400,000 - 0 - 0 = 400,000
And the contract pays the recipient 400,000 stroops
And withdrawn becomes 400,000
And deposit (1,000,000) == withdrawn (400,000) + refunded (0) + remaining_in_contract (600,000)
```

### Scenario: rejected — withdraw is only callable by the recipient

```gherkin
Given the same stream as above, with some nonzero claimable balance
When an address that is neither the recipient nor authorized by the recipient calls withdraw()
Then the call is rejected
And withdrawn is unchanged and no funds move
```

### Scenario: two withdrawals in the same ledger — the second is a no-op, not a failure

```gherkin
Given a stream with a nonzero claimable balance at ledger timestamp T
When the recipient calls withdraw() once and it succeeds, paying out the full claimable amount
And the recipient calls withdraw() again within the same ledger (same timestamp T)
Then the second call succeeds (it is not an error to call withdraw with nothing claimable)
And the second call transfers 0 stroops
And withdrawn is unchanged by the second call
And deposit == withdrawn + refunded + remaining_in_contract still holds after both calls
```

### Scenario: withdraw at exactly start

```gherkin
Given a stream: total=1,000,000, start=5,000, end=15,000, withdrawn=0
And now = 5,000 (exactly start)
When the recipient calls withdraw()
Then elapsed = 0, streamed = 0, claimable = 0
And the call succeeds and transfers 0 stroops
And deposit (1,000,000) == withdrawn (0) + refunded (0) + remaining_in_contract (1,000,000)
```

### Scenario: withdraw at exactly end

```gherkin
Given a stream: total=1,000,000, start=5,000, end=15,000, withdrawn=300,000 (from an earlier withdrawal)
And now = 15,000 (exactly end)
When the recipient calls withdraw()
Then elapsed clamps to duration (10,000), streamed = 1,000,000 (end-of-stream special case)
And claimable = 1,000,000 - 300,000 - 0 = 700,000
And the contract pays the recipient 700,000 stroops
And withdrawn becomes 1,000,000
And deposit (1,000,000) == withdrawn (1,000,000) + refunded (0) + remaining_in_contract (0)
```

### Scenario: withdraw is reduced by an unmet milestone gate

```gherkin
Given the Alice/Bob stream from concepts.md: base=18,000,000,000, milestone=12,000,000,000, duration 30 days
And now = day 10 (elapsed = 1/3 of duration), milestone unmet
Then streamed_total = 10,000,000,000, held = 4,000,000,000 (the milestone's streamed-to-date, locked)
When the recipient calls withdraw()
Then claimable = 10,000,000,000 - 0 - 4,000,000,000 = 6,000,000,000
And the contract pays the recipient 6,000,000,000, not the full 10,000,000,000 that has streamed
And withdrawn becomes 6,000,000,000
And deposit == withdrawn (6,000,000,000) + refunded (0) + remaining_in_contract (24,000,000,000)
```

### Scenario: withdraw after cancellation pays the frozen earned balance

```gherkin
Given a stream that was cancelled at elapsed=4,000 of a 10,000-second duration, total=1,000,000
And at cancellation streamed was 400,000 and withdrawn was 0, so the recipient's frozen claimable is 400,000
And the sender has already received their refund of 600,000
When the recipient calls withdraw() at any later timestamp
Then claimable is still 400,000 (frozen — accrual stopped at cancellation, it does not keep rising)
And the contract pays the recipient 400,000 stroops
And withdrawn becomes 400,000
And deposit (1,000,000) == withdrawn (400,000) + refunded (600,000) + remaining_in_contract (0)
```

### Scenario: withdraw on a duration-1-second stream, called at or after end

```gherkin
Given the duration-1-second stream from create_stream (total=7, start=100, end=101), withdrawn=0
And now = 101
When the recipient calls withdraw()
Then streamed = 7 (end-of-stream special case), claimable = 7
And the contract pays 7 stroops
And deposit (7) == withdrawn (7) + refunded (0) + remaining_in_contract (0)
```

### Scenario: withdraw on a 1-stroop stream before end pays nothing, and the remainder settles at end

```gherkin
Given the 1-stroop stream from create_stream (total=1, start=0, end=1,000,000), withdrawn=0
And now = 500,000 (elapsed half the duration)
When the recipient calls withdraw()
Then streamed = 1 * 500,000 / 1,000,000 = 0 (floored)
And the call succeeds and pays 0 stroops, withdrawn stays 0
When now advances to 1,000,000 (= end) and the recipient calls withdraw() again
Then streamed = 1 (end-of-stream special case), claimable = 1
And the contract pays the recipient the full 1 stroop
And deposit (1) == withdrawn (1) + refunded (0) + remaining_in_contract (0)
```

### Scenario: the indivisible-total stream settles to the exact deposit at the final withdrawal

```gherkin
Given the total=100, duration=3 stream from create_stream, withdrawn=0
And the recipient withdraws at now=1 (streamed 33, pays 33, withdrawn=33)
And the recipient withdraws at now=2 (streamed 66, pays 33 more, withdrawn=66)
When the recipient withdraws at now=3 (= end)
Then streamed = 100 (end-of-stream special case, not 100*3/3 which would also be 100 here but the principle holds for cases where it wouldn't)
And claimable = 100 - 66 - 0 = 34 (collects the two stroops that flooring had withheld at now=1 and now=2, plus the last third)
And deposit (100) == withdrawn (100) + refunded (0) + remaining_in_contract (0), with no dust stranded
```

---

## Feature: approve_milestone

### Scenario: happy path — approval releases accrued-to-date, not just future accrual

```gherkin
Given the Alice/Bob stream at day 18 (elapsed 1,555,200 of 2,592,000): streamed_total=18,000,000,000, milestone streamed-to-date=7,200,000,000 and unapproved (held), base streamed=10,800,000,000, withdrawn=6,000,000,000 (from an earlier partial withdrawal)
When the approver calls approve_milestone(milestone_id)
Then the milestone's state becomes met
And held drops from 7,200,000,000 to 0
And claimable becomes 18,000,000,000 - 6,000,000,000 - 0 = 12,000,000,000 — including the 7,200,000,000 that accrued while the gate was shut, released all at once
And no funds move yet (approve_milestone only changes claimability; withdraw moves funds)
And deposit (30,000,000,000) == withdrawn (6,000,000,000) + refunded (0) + remaining_in_contract (24,000,000,000) — unchanged by this call, holding trivially because approve_milestone moves claimability, not funds
```

### Scenario: rejected — approve_milestone is only callable by that milestone's named approver

```gherkin
Given a stream with an unmet milestone whose approver is address X
When an address Y != X calls approve_milestone(milestone_id), including the case where Y is the stream's sender
Then the call is rejected
And the milestone's state is unchanged and remains unmet
```

### Scenario: approval after the stream's end releases the full tranche, with no bonus for lateness

```gherkin
Given a stream with end=2,592,000, an unmet milestone of 1,200,000,000, now=3,000,000 (past end)
Then streamed_total for the milestone tranche = 1,200,000,000 (end-of-stream special case) and it is fully held
When the approver calls approve_milestone(milestone_id)
Then held drops to 0 and the full 1,200,000,000 becomes claimable immediately
And the recipient does not receive any amount beyond the milestone's own 1,200,000,000 — approval unlocks, it does not extend the stream or add bonus time
And whatever this stream's deposit is, deposit == withdrawn + refunded + remaining_in_contract holds unchanged — approve_milestone moves no funds, only claimability, so the invariant holds trivially here regardless of the other tranches' figures
```

### Scenario: approving a milestone on an already-cancelled stream is rejected

```gherkin
Given a stream that was cancelled while the milestone was still unmet
Then per the cancel behaviour below, the milestone's tranche has already been resolved as unstreamed and returned to the sender
When the approver calls approve_milestone(milestone_id)
Then the call is rejected — there is nothing left for the approval to release, and approving it would either be a no-op or would incorrectly manufacture claimable balance from funds no longer held by the contract for this stream
And the milestone's state and the stream's balances are unchanged
```

Note on why this one is marked decided while "cancel after end" below is marked `UNDECIDED`: both rest on the same class of evidence — the lifecycle diagram in architecture.md draws no arrow for either transition. What tips this one to a decided answer is the extra, substantive argument above: cancel has already moved the milestone's funds out of the contract and back to the sender, so there is a concrete reason approval must fail rather than just an absence of a diagram arrow. "Cancel after end" has no equivalent argument pointing either way, which is exactly why it stays `UNDECIDED` instead.

### Scenario: double approval of an already-met milestone

```gherkin
Given a milestone whose state is already met
When the approver calls approve_milestone(milestone_id) again
Then the call is UNDECIDED — see Undecided cases at the end of this document
```

---

## Feature: cancel

### Scenario: happy path — cancel partway through, recipient keeps earned, sender recovers the rest

```gherkin
Given a cancelable stream: total=1,000,000, start=0, end=10,000, no milestones, withdrawn=0
And now = 4,000 (elapsed 4,000 of 10,000)
When the sender calls cancel()
Then accrual freezes: streamed is fixed at 400,000 for all future reads of this stream
And the recipient's frozen claimable (400,000 - withdrawn) stays withdrawable — it is not swept
And the unstreamed remainder, 600,000, transfers to the sender immediately
And deposit (1,000,000) == withdrawn (0, so far) + refunded (600,000) + remaining_in_contract (400,000, still owed to the recipient)
```

### Scenario: rejected — cancel is only callable by the sender

```gherkin
Given a cancelable stream partway through
When an address that is neither the sender nor authorized by the sender calls cancel()
Then the call is rejected
And no funds move and the stream's state is unchanged
```

### Scenario: rejected — cancel on a non-cancelable stream

```gherkin
Given a stream created with cancelable=false
And any elapsed time, including zero
When the sender calls cancel()
Then the call is rejected
And no funds move — the stream continues to Completed on its own schedule
```

### Scenario: cancel with zero elapsed time

```gherkin
Given a cancelable stream: total=500,000, start=1,000, end=11,000, withdrawn=0
And now = 1,000 (exactly start, elapsed = 0)
When the sender calls cancel()
Then streamed = 0, so the recipient's frozen claimable is 0
And the full 500,000 returns to the sender immediately
And deposit (500,000) == withdrawn (0) + refunded (500,000) + remaining_in_contract (0)
```

### Scenario: cancel after end (the stream has already fully streamed)

```gherkin
Given a cancelable stream where now >= end, so streamed = total already, but the recipient has not withdrawn everything
When the sender calls cancel()
Then the outcome is UNDECIDED — see Undecided cases at the end of this document
```

### Scenario: cancel with an unmet milestone in flight — the gated tranche returns to the sender, not just its unaccrued fraction

```gherkin
Given the Alice/Bob stream at day 10 (elapsed 864,000 of 2,592,000): base streamed=6,000,000,000, milestone streamed-to-date=4,000,000,000 and unapproved (held), withdrawn=6,000,000,000 (recipient already withdrew the day-10 base claimable)
When the sender calls cancel()
Then the base tranche's unstreamed remainder (18,000,000,000 - 6,000,000,000 = 12,000,000,000) returns to the sender
And the milestone tranche is treated as entirely unstreamed and returns to the sender in full: 12,000,000,000 (its whole amount, including the 4,000,000,000 that had already accrued while the gate was shut — an unmet milestone is work that did not happen, so even the accrued-but-locked portion is forfeit, not just the not-yet-accrued portion)
And total refund to the sender = 12,000,000,000 + 12,000,000,000 = 24,000,000,000
And the recipient keeps their already-withdrawn 6,000,000,000 and has nothing further claimable from this stream
And deposit (30,000,000,000) == withdrawn (6,000,000,000) + refunded (24,000,000,000) + remaining_in_contract (0)
```

### Scenario: cancel with a milestone already approved before cancellation

```gherkin
Given the Alice/Bob stream at day 20 (elapsed 1,728,000 of 2,592,000, two-thirds through): base streamed = 18,000,000,000 * 2/3 = 12,000,000,000, milestone streamed = 12,000,000,000 * 2/3 = 8,000,000,000, streamed_total = 20,000,000,000
And the milestone was approved back at day 18 (per the approve_milestone happy-path scenario above), so at day 20 it is ordinary streamed balance, not held
And withdrawn = 18,000,000,000 (cumulative: 6,000,000,000 taken at day 10, plus the full 12,000,000,000 day-18 claimable withdrawn right after approval)
When the sender calls cancel()
Then the approved milestone's accrued-to-date amount is treated exactly like the base tranche: streamed_total (20,000,000,000) minus withdrawn (18,000,000,000) is 2,000,000,000 of frozen, still-owed claimable that stays with the recipient — it is not clawed back
And only the still-unstreamed remainder of both tranches combined returns to the sender: deposit (30,000,000,000) - streamed_total (20,000,000,000) = 10,000,000,000 — there is no unmet-milestone forfeiture here, because there is no unmet milestone
And deposit (30,000,000,000) == withdrawn (18,000,000,000) + refunded (10,000,000,000) + remaining_in_contract (2,000,000,000, the recipient's frozen claimable still to be withdrawn)
```

---

## Undecided cases

These are points where the current design docs ([concepts.md](../concepts.md),
[architecture.md](../architecture.md), [ROADMAP.md](../../ROADMAP.md)) do not determine the answer.
Each is `UNDECIDED` above; listed together here per the issue's request, so they're easy to find and
argue about without hunting through the scenarios.

1. **Double approval of an already-met milestone.** Does `approve_milestone` reject a second call the
   way a second `withdraw` in the same ledger is a no-op, or does it error? Nothing in
   architecture.md's authorization section or concepts.md's milestone-gates section says. This is
   distinct from milestone _revocation_ (below) — it's calling approve again, not un-approving.
2. **Cancel called after the stream has already reached `end`.** The lifecycle diagram in
   architecture.md shows `cancel()` as a transition out of `Pending` or `Streaming`, with no arrow from
   `Completed`. That suggests cancel might simply be disallowed once `now >= end`, but nothing states
   this explicitly, and functionally a no-op cancel (refund = 0, since nothing is unstreamed) would be
   harmless if allowed. Whether the call reverts or succeeds-as-a-no-op is unspecified.
3. **Milestone revocation.** Already flagged as [an open question in
   architecture.md](../architecture.md#open-questions) and as a TODO in concepts.md: can an approver
   un-approve a met milestone, and if funds were already withdrawn under that approval, what happens to
   them? No scenario above covers revocation because there is no entry point for it yet to write a
   scenario against.
4. **`create_stream` and non-standard transfer behaviour.** architecture.md flags with a TODO whether
   `create_stream` verifies the balance actually received against the requested `total` (to catch
   fee-on-transfer or rebasing tokens) or whether such assets are simply documented as unsupported. This
   changes whether a `create_stream` scenario against such a token would fail the call or silently create
   an under-funded stream — no scenario above covers it because the entry point's behaviour isn't decided.
5. **Withdrawing from an archived (TTL-lapsed) stream entry.** architecture.md says the SDK must detect
   archival and drive a restore-then-withdraw flow, but doesn't state what `withdraw` itself does if
   called directly against an archived entry — whether the contract call fails cleanly (entry not in the
   transaction's footprint) or whether restoration can be bundled into the same call. This is a
   real-machine SDK/contract-boundary question, not purely a contract-semantics one, but it affects what
   a `withdraw` test against a long-dormant stream should expect.
