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

On Stellar, "now" is the ledger close timestamp, not the sender's wall clock. See [architecture.md](architecture.md#ledger-time-is-the-clock) for what that costs you in precision.

### Terms

| Term | Meaning |
|---|---|
| **Stream** | One sender → one recipient, one asset, one schedule. The unit of everything. |
| **Sender** | Funds the stream at creation. May cancel if the stream is cancelable. |
| **Recipient** | Accrues continuously; calls `withdraw` to settle. |
| **Streamed** | Amount the formula says has accrued so far. |
| **Withdrawn** | Amount actually paid out. Always ≤ streamed. |
| **Claimable** | `streamed − withdrawn`, minus anything held by a milestone gate. |
| **Unstreamed** | `total − streamed`. What the sender gets back on cancel. |
| **Cliff** | A time before which nothing is claimable, even though accrual has started. |

### Cliffs

A cliff delays claimability, not accrual. With a 12-month stream and a 3-month cliff, the recipient's streamed balance rises from day one, but `claimable` stays 0 until month 3 — at which point three months' worth becomes available at once, and it goes back to accruing smoothly after that.

This is the standard vesting shape, and it's why "vesting with a cliff" is a streaming problem and not a separate product.

## Milestone gates

Time is a bad proxy for progress. A grant paid purely on a clock pays out whether or not the work happened. A grant paid purely on approval leaves the recipient unfunded while they do the work. StelFlow's answer is to keep the clock running and gate the *release*.

A **milestone** attaches to a portion of the stream. Each milestone has an amount, an approver, and a state. Funds inside an unmet milestone's portion accrue normally but are not claimable. When the approver marks the milestone met, that portion unlocks and joins the recipient's claimable balance — including everything that accrued while it was locked.

Concretely, a 100,000 USDC / 12-month grant might be:

| Portion | Amount | Gate |
|---|---|---|
| Base | 40,000 | Time only |
| Milestone 1 — spec published | 20,000 | Approver marks met |
| Milestone 2 — testnet deploy | 20,000 | Approver marks met |
| Milestone 3 — audit complete | 20,000 | Approver marks met |

The recipient always has the base stream to live on. The gated tranches accrue in the background, so when milestone 2 is approved in month 8, the recipient immediately receives eight months of its accrual rather than starting from zero. Approval unlocks; it does not start the clock.

The approver is a role, not necessarily the sender — it can be a grant committee, a multisig, or a Trustless Work escrow acting as the arbiter. That last case is the point of the integration: Trustless Work already implements escrow with milestones, approvals, and disputes on Soroban. StelFlow does not want to reimplement dispute resolution. It wants to be the thing that pays out continuously while that process runs.

<!-- TODO(maintainer): decide and document whether an approver can *revoke* a met milestone, and what happens to funds already withdrawn under it. This changes the storage model, so it needs an answer before Phase 1. -->

### What a gate does not do

- It does not pause accrual. Time keeps moving; only claimability is held.
- It does not extend the stream. If a milestone is approved after the end time, the recipient gets its full amount immediately — they don't get extra time.
- It does not give the approver custody. The approver flips a flag. They cannot redirect funds.

## Cancellation and clawback

A stream can be created cancelable or not. Non-cancelable is the right default for vesting: the recipient needs a guarantee. Cancelable is the right default for grants: the funder needs an exit if the work stops.

On cancel:

1. Accrual freezes at the cancellation ledger's timestamp.
2. The recipient's streamed-but-unwithdrawn balance stays theirs to withdraw. It does not get swept.
3. The unstreamed remainder returns to the sender.
4. Unapproved milestone tranches are treated as unstreamed and return to the sender.

Point 4 is a deliberate choice: an unmet milestone is work that didn't happen, so its funds go back. Point 2 is the other half of the deal — cancellation is not a clawback of earned money. "Clawback" in StelFlow means only the unstreamed remainder.

> Note: this is distinct from SEP-41's `clawback`, which is an *issuer* power to burn an asset from any holder. If the asset you stream has issuer clawback enabled, the issuer can pull funds out from under a live stream, and StelFlow cannot prevent that. Check the asset's flags before you rely on a stream.

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

- [architecture.md](architecture.md) — how this is actually built on Soroban, and which constraints bend the design.
- [../ROADMAP.md](../ROADMAP.md) — the order it gets built in.
