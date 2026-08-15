# Glossary

Definitions for the vocabulary used across this repository — StelFlow's own terms and the Soroban-specific ones the design leans on. General blockchain vocabulary (wallet, transaction, fee) is assumed.

Everything here describes the intended design. None of it is implemented.

> **The one to read first: [clawback](#clawback-issuer-sense) means two unrelated things in this project.** One is a sender recovering funds nobody has earned yet. The other is an asset issuer burning funds a recipient *has* earned. StelFlow guarantees the first cannot touch earned money; it cannot defend against the second at all. Both entries are below and each points at the other.

Longer explanations live in [concepts.md](concepts.md) for the model and [architecture.md](architecture.md) for the Soroban mechanics. This page is the lookup, not the tutorial.

---

### Accrual

The continuous increase in a recipient's [streamed](#streamed) balance as ledger time advances. Nothing happens on-chain to cause it — no transfer, no scheduled job — the number is recomputed from the current [ledger close time](#ledger-close-time) whenever someone asks.

### Approver

The address authorized to mark a [milestone](#milestone) met, named per milestone when the stream is created. It is a role, not a party to the payment: an approver may be the sender, a grant committee, a multisig, or a contract such as a [Trustless Work](#trustless-work) escrow. An approver flips a flag and nothing more — they cannot redirect, withdraw, or take custody of funds.

### Cancelable

A property fixed at creation determining whether the sender may [cancel](#cancellation) the stream **alone**. Non-cancelable is the usual choice for vesting, where the recipient needs a guarantee; cancelable is the usual choice for grants, where the funder needs an exit if the work stops. Note the precise meaning: on a non-cancelable stream the sender and recipient acting *together* can still cancel, settling under the ordinary rules. The flag governs unilateral power, not the existence of an exit.

### Cancellation

Ending a stream before its end time. [Accrual](#accrual) freezes at the cancelling ledger's timestamp, the recipient keeps their streamed-but-unwithdrawn balance, and the [unstreamed balance](#unstreamed-balance) returns to the sender — as do the tranches of any milestone still unmet, on the reasoning that an unmet milestone is work that did not happen.

### Claimable

What the recipient can withdraw at this moment: `streamed − withdrawn − held`. It is not the same as [streamed](#streamed), because funds behind an unmet [milestone gate](#milestone-gate) have accrued but are [held](#held).

### Clawback (issuer sense)

An asset *issuer* burning tokens out of any holder's balance — including a balance StelFlow is holding for a live stream, and including funds the recipient has already earned. On Stellar this is the [Stellar Asset Contract](#stellar-asset-contract-sac)'s admin `clawback` function, which succeeds only when the holder's trustline has the [`TRUSTLINE_CLAWBACK_ENABLED_FLAG`](https://developers.stellar.org/docs/tokens/control-asset-access#clawback-enabled-0x8) set; [SEP-41](#sep-41) standardizes the `clawback` *event* but deliberately defines no such function. StelFlow cannot prevent this and does not claim to — check an asset's flags before relying on a stream denominated in it.

**Contrast with [clawback (StelFlow sense)](#clawback-stelflow-sense)** — unrelated powers, held by different parties, over different money; confusing them means misjudging what the protocol guarantees.

### Clawback (StelFlow sense)

A sender recovering the [unstreamed balance](#unstreamed-balance) of a stream on [cancellation](#cancellation). It reaches only funds that have not accrued yet; already-streamed funds stay the recipient's, and the clock decides that split rather than either party. Cancellation is therefore not a clawback of earned money.

**Contrast with [clawback (issuer sense)](#clawback-issuer-sense)** — that one *can* reach earned funds, and StelFlow cannot stop it.

### Cliff

A time before which nothing is [claimable](#claimable), even though [accrual](#accrual) has already started. It delays claimability, not accrual: at the cliff, everything accrued so far becomes available at once, and the stream keeps accruing smoothly afterwards. A cliff is not a lifecycle state — it is a predicate inside the claimable calculation.

### Duration

`end − start`, in seconds. Every [tranche](#tranche) of a stream, gated or not, runs on the same duration; a [milestone gate](#milestone-gate) holds funds without changing the schedule they accrue on.

### Escrow

Holding funds in a contract until some condition resolves. StelFlow is an escrow in the custody sense — it takes the full deposit up front — but not in the release sense, since it pays out continuously rather than in a lump and implements no dispute resolution of its own. See [Trustless Work](#trustless-work) for the part it delegates.

### Footprint

The set of [ledger entries](#ledger-entry) a Soroban transaction declares it will read and write, determined by simulating the transaction before submission. A transaction is capped on how many entries its footprint may contain, and those caps are [network settings](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering#resource-limitations) that change between protocol upgrades rather than fixed constants. This cap is why StelFlow bounds milestones per stream and the size of any batch entry point.

Reference: [Transaction simulation → Footprint](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/transaction-simulation#footprint)

### Held

Funds that have [streamed](#streamed) but that an unmet [milestone gate](#milestone-gate) is withholding from [claimable](#claimable). Every stream satisfies `claimable = streamed − withdrawn − held` at every moment.

### i128

The signed 128-bit integer Soroban and [SEP-41](#sep-41) use for token balances, and the type all of StelFlow's accrual math runs in. The width is not optional: `total × elapsed` for a large stream over a long range reaches roughly 10²⁴, which overflows `i64` even though the result of the division would fit.

### Indexer

The planned off-chain service that ingests StelFlow's contract events and answers the historical queries a contract cannot — stream lists by participant, withdrawal timelines, approval audit trails. It is a cache, not an authority: if the indexer and the chain disagree, the chain is right, and no recipient ever needs it to get paid.

### Instance storage

One of Soroban's three storage types. A contract's instance entry is archived together with its Wasm and is loaded on *every* call, so StelFlow uses it only for small contract-wide config — never per-stream state, which would make every call pay to load every stream.

Reference: [State archival → Instance](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival#instance)

### Ledger close time

The timestamp of the ledger executing a transaction, in seconds since the Unix epoch, read as `env.ledger().timestamp()`. This is StelFlow's only clock: "now" is a consensus value rather than the caller's wall clock, and its resolution is a ledger — a few seconds — not a second, so two withdrawals in the same ledger see an identical timestamp.

Reference: [Ledgers → Close time](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers#close-time)

### Ledger entry

The unit of state on Stellar: one account, one trustline, one contract data key. StelFlow stores one [persistent](#persistent-storage) entry per stream, which is what makes the per-transaction entry cap the binding constraint on batch operations. See [footprint](#footprint).

### Milestone

A named condition attached to a [tranche](#tranche) of a stream, carrying an amount, an [approver](#approver), and a met/unmet state. Milestones are stored inside the stream's own entry rather than as separate entries, which keeps a withdrawal to one read but forces a hard cap on how many a stream may have.

### Milestone gate

The mechanism that keeps an unmet [milestone](#milestone)'s tranche accruing but unclaimable. When the approver marks the milestone met, the gate releases everything it has [held](#held) — including accrual from before the approval — into [claimable](#claimable). A gate does not pause accrual, does not extend the stream, and does not give the approver custody.

### Persistent storage

One of Soroban's three storage types, and the one StelFlow uses for stream state: one entry per stream, keyed by stream ID. When a persistent entry's [TTL](#ttl-time-to-live) lapses the entry is archived rather than deleted, and anyone can restore it — which is the property that makes it the only defensible choice for custody records.

Reference: [State archival → Persistent](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival#persistent)

### Rate per second

`total ÷ duration` — the speed a stream pays at. StelFlow neither stores nor computes this value: the contract evaluates `total × elapsed ÷ duration` with the multiplication first, because dividing first would truncate the rate toward zero and discard the entire fractional part for realistic amounts. Treat it as a figure for display, never as an input to settlement.

### Recipient

The address a stream pays. The recipient [accrues](#accrual) continuously and calls `withdraw` to settle; they choose when and how often, which changes what they spend on fees but never what they receive in total.

### RestoreFootprintOp

The Stellar operation that brings an archived [persistent](#persistent-storage) entry back to live state in exchange for a fee. A recipient whose long-dormant stream has been archived restores it and then withdraws — nothing is lost, and anyone may pay to restore.

Reference: [State archival → RestoreFootprintOp](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival#restorefootprintop)

### SAC

See [Stellar Asset Contract (SAC)](#stellar-asset-contract-sac).

### Sender

The address that funds a stream at creation, transferring the entire total up front. A stream that is not fully funded at creation is a promise rather than a stream. The sender may [cancel](#cancellation) if the stream is [cancelable](#cancelable), and recovers only the [unstreamed balance](#unstreamed-balance) when they do.

### SEP-41

The Stellar Ecosystem Proposal defining the standard Soroban token interface — `transfer`, `transfer_from`, `approve`, `allowance`, `balance`, `burn`, `decimals`, and metadata. StelFlow streams any SEP-41 asset and calls only the handful of functions it needs, since SEP-41 is still a Draft SEP. It deliberately defines no `mint` or `clawback` function, standardizing only the events those actions must emit — see [clawback (issuer sense)](#clawback-issuer-sense).

Reference: [SEP-41 spec](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md) · [Stellar docs on the token interface](https://developers.stellar.org/docs/tokens/token-interface)

### State archival

Soroban's mechanism for evicting [ledger entries](#ledger-entry) whose [TTL](#ttl-time-to-live) has lapsed. [Persistent](#persistent-storage) entries are archived rather than destroyed — unreadable until restored via [RestoreFootprintOp](#restorefootprintop) — while [temporary](#temporary-storage) entries are deleted outright. A long-dormant stream archiving is expected behavior, not a failure.

Reference: [State archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)

### Stellar Asset Contract (SAC)

The built-in Soroban contract that exposes a classic Stellar asset — USDC included — through the [SEP-41](#sep-41) interface, which is how StelFlow reaches classic assets with one integration path. Its admin interface extends SEP-41 with `mint`, `set_admin`, and [`clawback`](#clawback-issuer-sense).

Reference: [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract)

### Stream

One sender → one recipient, one asset, one schedule. The unit of everything in StelFlow. The stream *is* the formula, not the payments: withdrawals are settlement events against it and change nothing about it.

### Streamed

The amount the accrual formula says has accrued so far, `total × elapsed ÷ duration` with `elapsed` clamped to the stream's bounds. Not the same as [claimable](#claimable) — funds behind an unmet [milestone gate](#milestone-gate) are streamed but [held](#held).

### Stroop

The smallest unit of a classic Stellar asset: one ten-millionth, i.e. 7 decimals. StelFlow's contract only ever moves an asset's smallest unit, never a human-readable amount — but a [SEP-41](#sep-41) token declaring different `decimals` has a smallest unit that is not a stroop, so the word is exact only for classic assets and their [SAC](#stellar-asset-contract-sac) wrappers.

Reference: [Stellar glossary → Stroop](https://developers.stellar.org/docs/learn/glossary#stroop)

### Temporary storage

One of Soroban's three storage types. When a temporary entry's [TTL](#ttl-time-to-live) lapses the entry is **permanently deleted and cannot be restored**, which is why StelFlow never uses it for stream state — deleting a stream would delete a custody record for real money.

Reference: [State archival → Temporary](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival#temporary)

### Tranche

A portion of a stream's total with its own gate: the base tranche runs on time alone, and each [milestone](#milestone) tranche is [held](#held) by a [milestone gate](#milestone-gate) until approved. All tranches of a stream share one start, end, and [duration](#duration). These docs use "portion" interchangeably.

### Trustless Work

[Escrow](#escrow)-as-a-service on Soroban, with milestones, approvals, and disputes already built. The intended integration names a Trustless Work escrow as a milestone's [approver](#approver): the escrow decides *whether* a condition is met, and StelFlow decides *how fast* money moves once it is.

Reference: [docs.trustlesswork.com](https://docs.trustlesswork.com/)

### TTL (time to live)

The number of ledgers a [ledger entry](#ledger-entry) stays live before it becomes subject to [state archival](#state-archival), expressed on-chain as the sequence number of the ledger it lives until. Every state-changing StelFlow call extends its stream's TTL, so an active stream keeps itself alive as a side effect of being used, and a public `bump_stream` lets anyone extend a dormant one.

Reference: [State archival → TTL](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival#ttl)

### Unstreamed balance

`total − streamed`: the part of the deposit that has not accrued yet. This is what returns to the sender on [cancellation](#cancellation), and it is the only money [clawback (StelFlow sense)](#clawback-stelflow-sense) can reach.

### Withdrawn

The running total actually paid out to the recipient, always ≤ [streamed](#streamed). It is the source of truth for what has been paid: recomputing `streamed` from scratch and subtracting `withdrawn` on each withdrawal keeps rounding error from accumulating across them.

---

## Next

- [concepts.md](concepts.md) — the model these terms describe, explained from zero.
- [architecture.md](architecture.md) — the Soroban constraints behind the storage and asset vocabulary.
