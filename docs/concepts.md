# Concepts

This page explains money streaming and milestone-gating from zero. If you already know Sablier, skip to [Milestone gates](#milestone-gates) — that part is where StelFlow differs.

Everything here describes the intended design. None of it is implemented.

## The problem with paying people over time

Say you owe someone 12,000 USDC over 12 months. You have three options today, and all three are bad in a specific way.

**Send 12 payments.** Someone has to sign 12 transactions on schedule. If that person leaves, gets locked out, or forgets, the recipient stops getting paid. The recipient has no on-chain guarantee that months 7-12 will ever arrive.

**Send all 12,000 up front.** Now the recipient has no incentive to finish, and you have no recourse.

**Put 12,000 in an escrow that releases on approval.** Better, but the recipient gets nothing for months and then everything at once. They can't pay rent with a pending approval.

## Money streaming

Streaming replaces the schedule with arithmetic. You deposit the full amount once, and the contract records four things: the token, the total, a start time, and an end time. From then on, the recipient's claimable balance is computed rather than transferred:

```
elapsed   = clamp(now, start, end) - start
duration  = end - start
streamed  = total * elapsed / duration
claimable = streamed - already_withdrawn
```

No transaction happens as time passes. Nobody pushes anything. The number just goes up because `now` went up. When the recipient wants their money, they call `withdraw`, and the contract pays out whatever `claimable` currently evaluates to.

This is the whole idea. A few consequences worth internalizing:

- **The recipient controls timing.** They can withdraw daily, or once at the end, or never. Withdrawing more often costs more in fees but changes nothing about the total.
- **Withdrawals are not "the stream."** The stream is the formula. Withdrawals are just settlement events against it.
- **Cancellation has a natural meaning.** At any moment there is a clean split between what has streamed and what has not. Cancel, and the recipient keeps the streamed part, the sender takes back the rest. No negotiation about what's fair — the clock already decided.

On Stellar, "now" is the [ledger close](glossary.md#ledger-close-time) timestamp, not the sender's wall clock. See [architecture.md](architecture.md#ledger-time-is-the-clock) for what that costs you in precision.

### Terms

The working set for this page. [glossary.md](glossary.md) has the full list, including the Soroban-specific vocabulary [architecture.md](architecture.md) uses.

| Term | Meaning |
|---|---|
| **[Stream](glossary.md#stream)** | One sender → one recipient, one asset, one schedule. The unit of everything. |
| **[Sender](glossary.md#sender)** | Funds the stream at creation. May cancel if the stream is cancelable. |
| **[Recipient](glossary.md#recipient)** | Accrues continuously; calls `withdraw` to settle. |
| **[Streamed](glossary.md#streamed)** | Amount the formula says has accrued so far. |
| **[Withdrawn](glossary.md#withdrawn)** | Amount actually paid out. Always ≤ streamed. |
| **[Claimable](glossary.md#claimable)** | `streamed − withdrawn`, minus anything held by a milestone gate. |
| **[Unstreamed](glossary.md#unstreamed-balance)** | `total − streamed`. What the sender gets back on cancel. |
| **[Cliff](glossary.md#cliff)** | A time before which nothing is claimable, even though accrual has started. |

### Cliffs

A cliff delays claimability, not accrual. With a 12-month stream and a 3-month cliff, the recipient's streamed balance rises from day one, but `claimable` stays 0 until month 3 — at which point three months' worth becomes available at once, and it goes back to accruing smoothly after that.

This is the standard vesting shape, and it's why "vesting with a cliff" is a streaming problem and not a separate product.

## Milestone gates

Time is a bad proxy for progress. A grant paid purely on a clock pays out whether or not the work happened. A grant paid purely on approval leaves the recipient unfunded while they do the work. StelFlow's answer is to keep the clock running and gate the *release*.

A **[milestone](glossary.md#milestone)** attaches to a portion of the stream. Each milestone has an amount, an [approver](glossary.md#approver), and a state. Funds inside an unmet milestone's portion accrue normally but are not claimable. When the approver marks the milestone met, that portion unlocks and joins the recipient's claimable balance — including everything that accrued while it was locked.

Concretely, a 100,000 USDC / 12-month grant might be:

| Portion | Amount | Gate |
|---|---|---|
| Base | 40,000 | Time only |
| Milestone 1 — spec published | 20,000 | Approver marks met |
| Milestone 2 — testnet deploy | 20,000 | Approver marks met |
| Milestone 3 — audit complete | 20,000 | Approver marks met |

The recipient always has the base stream to live on. The gated tranches accrue in the background, so when milestone 2 is approved in month 8, the recipient immediately receives eight months of its accrual rather than starting from zero. Approval unlocks; it does not start the clock.

The approver is a role, not necessarily the sender — it can be a grant committee, a multisig, or a Trustless Work escrow acting as the arbiter. That last case is the point of the integration: Trustless Work already implements escrow with milestones, approvals, and disputes on Soroban. StelFlow does not want to reimplement dispute resolution. It wants to be the thing that pays out continuously while that process runs.

**Approval is final. A met milestone cannot be un-met.** The approver's only power is to release, and once a tranche is released it stays released — there is no revocation, and no way for anyone to reduce what the recipient has already become entitled to. A sender who wants a way out needs a [cancelable](glossary.md#cancelable) stream, which ends the whole stream rather than re-locking one tranche.

That cuts both ways, and the cost is worth knowing before you name an approver: if a milestone is approved in error, StelFlow offers no remedy. Where a real dispute process is needed, name a Trustless Work escrow as the approver and let it withhold approval until its own process concludes. Reasoning and the alternatives considered: [research/milestone-revocation.md](research/milestone-revocation.md).

### What a gate does not do

- It does not pause accrual. Time keeps moving; only claimability is held.
- It does not extend the stream. If a milestone is approved after the end time, the recipient gets its full amount immediately — they don't get extra time.
- It does not give the approver custody. The approver flips a flag, once, in one direction. They cannot redirect funds, and they cannot take back what they released.

## A worked example: Alice and Bob

The grant above shows the shape. This one shows the numbers, small enough to check by hand.

Alice streams 3,000 USDC to Bob over 30 days. Part of it is gated on a milestone.

| | Amount | Gate |
|---|---|---|
| Base | 1,800 USDC | Time only |
| Milestone — design handoff | 1,200 USDC | Approver marks met |
| **Deposit** | **3,000 USDC** | |

USDC has 7 decimals, so every figure below is in [stroops](glossary.md#stroop). 1 USDC is 10,000,000 stroops, and the 3,000 USDC deposit is **30,000,000,000 stroops**. The contract never sees "3,000 USDC" — it only ever moves stroops.

The schedule is 30 days, so `duration` is 2,592,000 seconds. Both portions run on that same clock.

### Day 0 — Alice creates the stream

One transaction. 30,000,000,000 stroops move from Alice's account into the contract, and the contract stores the token, the two portion amounts, `start`, `end`, and the milestone's approver and state.

What does not happen: nothing moves to Bob, and nothing is scheduled. There is no job to run and no signer to keep alive. From here on, Bob's balance changes because `now` changes.

### Day 10 — what Bob has accrued

`elapsed` is 864,000 seconds of a 2,592,000-second duration, so each portion has streamed a third of itself:

```
base      = 18,000,000,000 * 864,000 / 2,592,000 =  6,000,000,000   (600 USDC)
milestone = 12,000,000,000 * 864,000 / 2,592,000 =  4,000,000,000   (400 USDC)
streamed  =                                        10,000,000,000  (1,000 USDC)
```

Bob has accrued 1,000 USDC. He cannot claim 1,000 USDC. The milestone is unmet, so its 4,000,000,000 stroops are held by the gate:

```
claimable = streamed - withdrawn - held
          = 10,000,000,000 - 0 - 4,000,000,000
          =  6,000,000,000   (600 USDC)
```

### Day 10 — Bob withdraws

Bob calls `withdraw` and receives 6,000,000,000 stroops. `withdrawn` goes from 0 to 6,000,000,000 and `claimable` drops to 0.

Nothing else changes. `streamed` is still 10,000,000,000 — the withdrawal settled against the formula, it did not alter it. The gate still holds 4,000,000,000, which keeps growing.

### Day 18 — the milestone is approved

First, where accrual stands. `elapsed` is 1,555,200 seconds, three fifths of the duration:

```
base      = 18,000,000,000 * 1,555,200 / 2,592,000 = 10,800,000,000  (1,080 USDC)
milestone = 12,000,000,000 * 1,555,200 / 2,592,000 =  7,200,000,000    (720 USDC)
streamed  =                                          18,000,000,000  (1,800 USDC)
```

Just before approval, Bob can claim 10,800,000,000 − 6,000,000,000 = 4,800,000,000 stroops (480 USDC). The gate holds 7,200,000,000.

The approver marks the milestone met. The gate releases, and the held amount joins `claimable`:

```
claimable = 18,000,000,000 - 6,000,000,000 - 0
          = 12,000,000,000  (1,200 USDC)
```

**This is the step to understand.** Bob does not start earning the milestone portion on day 18 — he receives 720 USDC that accrued over the previous 18 days while the gate held it. Approval unlocked funds that were already there. It did not start a clock.

Bob withdraws the full 12,000,000,000 stroops. Total withdrawn is now 18,000,000,000.

### Day 30 — final withdrawal

`elapsed` clamps to `duration`, so both portions have streamed in full: 18,000,000,000 and 12,000,000,000, totalling the whole 30,000,000,000 deposit.

```
claimable = 30,000,000,000 - 18,000,000,000 - 0
          = 12,000,000,000  (1,200 USDC)
```

Of that, 7,200,000,000 stroops are the base portion's last 12 days and 4,800,000,000 are the milestone portion's. Bob withdraws it, and `claimable` is 0 with the stream fully settled.

### Stream state at each checkpoint

All figures in stroops.

| Moment | `elapsed` (s) | Streamed | Withdrawn | Held by gate | Claimable |
|---|---:|---:|---:|---:|---:|
| Day 0, after create | 0 | 0 | 0 | 0 | 0 |
| Day 10, before withdraw | 864,000 | 10,000,000,000 | 0 | 4,000,000,000 | 6,000,000,000 |
| Day 10, after withdraw | 864,000 | 10,000,000,000 | 6,000,000,000 | 4,000,000,000 | 0 |
| Day 18, before approval | 1,555,200 | 18,000,000,000 | 6,000,000,000 | 7,200,000,000 | 4,800,000,000 |
| Day 18, after approval | 1,555,200 | 18,000,000,000 | 6,000,000,000 | 0 | 12,000,000,000 |
| Day 18, after withdraw | 1,555,200 | 18,000,000,000 | 18,000,000,000 | 0 | 0 |
| Day 30, before withdraw | 2,592,000 | 30,000,000,000 | 18,000,000,000 | 0 | 12,000,000,000 |
| Day 30, after withdraw | 2,592,000 | 30,000,000,000 | 30,000,000,000 | 0 | 0 |

Every row satisfies `claimable = streamed − withdrawn − held`.

### Reconciliation

| Event | Stroops | USDC |
|---|---:|---:|
| Day 10 withdrawal | 6,000,000,000 | 600 |
| Day 18 withdrawal | 12,000,000,000 | 1,200 |
| Day 30 withdrawal | 12,000,000,000 | 1,200 |
| **Total paid to Bob** | **30,000,000,000** | **3,000** |
| Alice's deposit | 30,000,000,000 | 3,000 |
| **Difference** | **0** | **0** |

Everything Alice deposited reached Bob. Nothing is stranded in the contract, and no stroop is unaccounted for.

Day 10, 18, and 30 were chosen because each divides the portions evenly. At an arbitrary second the integer division truncates, so `streamed` can sit a few stroops below the real-valued figure. Those stroops are not lost: `streamed` is recomputed from the formula on every call rather than accumulated, so truncation never compounds and accrual picks them up as it moves past them. The final withdrawal settles to exactly the deposit because the end-of-stream case pays out the remaining balance rather than recomputing — see [architecture.md](architecture.md#arithmetic).

## Cancellation and clawback

A stream can be created [cancelable](glossary.md#cancelable) or not. Non-cancelable is the right default for vesting: the recipient needs a guarantee. Cancelable is the right default for grants: the funder needs an exit if the work stops.

On cancel:

1. Accrual freezes at the cancellation ledger's timestamp.
2. The recipient's streamed-but-unwithdrawn balance stays theirs to withdraw. It does not get swept.
3. The unstreamed remainder returns to the sender.
4. Unapproved milestone tranches are treated as unstreamed and return to the sender.

Point 4 is a deliberate choice: an unmet milestone is work that didn't happen, so its funds go back. Point 2 is the other half of the deal — cancellation is not a clawback of earned money. ["Clawback" in StelFlow](glossary.md#clawback-stelflow-sense) means only the unstreamed remainder.

> Note: this is distinct from [the Stellar Asset Contract's `clawback`](glossary.md#clawback-issuer-sense), which is an *issuer* power to burn an asset from any holder. If the asset you stream has issuer clawback enabled, the issuer can pull funds out from under a live stream, and StelFlow cannot prevent that. Check the asset's flags before you rely on a stream.

## How this differs from what already exists

| | Periodic payments | Lump escrow | Pure streaming (Sablier-style) | StelFlow |
|---|---|---|---|---|
| Recipient paid continuously | ✗ | ✗ | ✓ | ✓ |
| Needs a live signer | ✓ | ✗ | ✗ | ✗ |
| Conditional on work | ✗ | ✓ | ✗ | ✓ |
| Sender can recover unearned funds | ✓ | ✓ | ✓ | ✓ |
| Recipient funded while conditions pend | ✓ | ✗ | ✓ | ✓ |

The last row is the one StelFlow is built for.

## Next

- [glossary.md](glossary.md) — every term on this page in one place, plus the Soroban vocabulary.
- [architecture.md](architecture.md) — how this is actually built on Soroban, and which constraints bend the design.
- [specs/behaviour.md](specs/behaviour.md) — the semantics on this page turned into Given/When/Then scenarios, including the awkward cases.
- [../ROADMAP.md](../ROADMAP.md) — the order it gets built in.
