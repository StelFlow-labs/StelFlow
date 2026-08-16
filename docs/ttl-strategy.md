# Research: TTL and state-archival strategy for long-lived streams

Answers [issue #6](https://github.com/StelFlow-labs/StelFlow/issues/6). Narrows the TODO in [architecture.md → Storage type and TTL](architecture.md#storage-type-and-ttl).

**The problem, restated precisely:** a stream is one [`persistent`](glossary.md#persistent-storage) entry. Persistent entries have a [TTL](glossary.md#ttl-time-to-live) that must be periodically extended or the entry [archives](glossary.md#state-archival). A 4-year vesting stream with a 1-year cliff sits untouched for far longer than any single TTL extension can cover — checked below, the network's own maximum extension window is about six months, not four years. Archival of the highest-value streams isn't a tail risk to design around; it's what happens by default unless something acts on the stream's behalf. This document works out how TTL and archival actually behave today, what keeping a stream alive costs, which mitigation is worth building, and what a recipient's SDK needs to do about the streams that archive anyway.

All network numbers below were checked with `stellar network settings --network testnet` on **2026-08-11**, using stellar-cli 23.4.1. Testnet reported **protocol version 27**; the installed CLI only fully understands protocol 23, so the dump may be missing settings introduced after that protocol. Anything numeric in this document is a snapshot, not a constant — see [§ Parameters that must not be hardcoded](#parameters-that-must-not-be-hardcoded) for why, and how the contract and SDK should read these live instead.

## How TTL, archival, and restoration actually work

### Storage types, briefly

Soroban has three storage types; StelFlow already chose [`persistent`](glossary.md#persistent-storage) for stream state, for the reason [architecture.md](architecture.md#storage-type-and-ttl) gives — [`temporary`](glossary.md#temporary-storage) entries are deleted, not archived, and that's fatal for a custody record. Confirmed straight from the source:

> When a Temporary entry's TTL is 0, it is deleted from the ledger and is permanently inaccessible. When a Persistent or Instance entry TTL is 0, it is "archived" and can't be accessed until it is "restored".
> — [Stellar docs: State Archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival), checked 2026-08-11

The formal protocol definition is [CAP-0046-12, "Soroban State Archival Interface"](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-12.md) (Status: Final).

One nuance worth carrying into the design: **[instance storage](glossary.md#instance-storage) shares one TTL across the whole contract**, while persistent entries each carry their own. That asymmetry matters for the recommendation below — instance archiving blocks *every* stream at once, while one stream's persistent entry archiving blocks only that stream. They should not get the same level of care.

### TTL mechanics

Each entry stores a `liveUntilLedger` field. TTL is `liveUntilLedger − current_ledger`. Extension happens via `env.storage().persistent().extend_ttl(key, threshold, extend_to)` from inside the contract, or via the standalone `ExtendFootprintTTLOp` operation, which anyone can submit for any entry — **there is no auth check on TTL extension**:

> There is no access control for TTL extension operations. Any user may invoke `ExtendFootprintTTLOp` on any `LedgerEntry`.
> — [Stellar docs: Persisting Data](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/persisting-data), checked 2026-08-11

This is exactly what makes architecture.md's permissionless `bump_stream` a sound pattern rather than a workaround — it's how the protocol expects shared/dormant state to be kept alive.

`extend_ttl(threshold, extend_to)` semantics, confirmed against both the docs and a working example contract:

- `threshold`: if the entry's current TTL is **already** ≥ `threshold`, the call is a no-op (saves rent on redundant extensions).
- `extend_to`: the entry's new TTL floor, in ledgers from now. If the entry's current TTL already exceeds `extend_to`, nothing changes.
- Extension can never exceed the network's current maximum TTL, regardless of what's requested — the excess is silently clamped, not rejected.

Two network floors/ceilings bound every extension, and they are the load-bearing numbers for this whole document:

| Parameter | Testnet value (2026-08-11) | @ 5s/ledger¹ |
|---|---|---|
| `state_archival.min_persistent_ttl` | 120,960 ledgers | **7 days** |
| `state_archival.max_entry_ttl` | 3,110,400 ledgers | **180 days (~6 months)** |
| `state_archival.min_temporary_ttl` | 720 ledgers | 1 hour |

¹ `scp_timing.ledger_target_close_time_milliseconds = 5000` on testnet today — itself a network parameter, not a physical constant. All "real time" figures in this document are `ledgers × 5s`, labeled as approximations for that reason.

**The consequence that drives the rest of this document:** no single `extend_ttl` call — no matter how aggressively it's called, no matter who pays — can push a stream's TTL out further than ~180 days from *now*. A 4-year (≈1,460-day) stream cannot be extended once at creation and then ignored. It needs to be touched, by someone, roughly every six months for its entire life, or it archives. "Extend aggressively at creation" reduces how *often* that's needed; it cannot eliminate the need.

### Restoration

`RestoreFootprintOp` restores an archived persistent or instance entry, XDR: `struct RestoreFootprintOp { ExtensionPoint ext; }`. It restores entries listed in the transaction's read-write footprint, at a fee, and — critically — **Protocol 23 changed how most restoration actually happens in practice**:

> Starting in Protocol 23 (CAP-0066: Soroban In-Memory Read Resource), archived Persistent or Instance contract entries can be automatically restored before a host function runs, but only if they're included in the transaction's restore list. In practice, this list is usually populated by the contract invocation simulation... `RestoreFootprintOp` is, for the most part, no longer needed starting in Protocol 23.
> — [Stellar docs: State Archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival), checked 2026-08-11

Formal reference: [CAP-0066, "Soroban In-memory Read Resource"](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0066.md) (Status: Final, Protocol version: 23). Testnet is already at protocol 27, so this behavior is live on the network StelFlow will develop against.

This matters more than it looks. Architecture.md's model — "the SDK must detect an archived entry and produce a restore-then-withdraw flow" — was written before accounting for the fact that, as of Protocol 23, a correctly-written client doesn't need to *detect* anything explicitly: `simulateTransaction` itself reports the restoration requirement (as a `restorePreamble`, in the JS SDK's terms) alongside the normal simulation result, and the SDK's job is to act on that field, not to catch a failure and reverse-engineer what went wrong. Concrete flow in [§ Restore-then-withdraw](#restore-then-withdraw-concrete-guidance-for-the-sdk).

The other detail worth flagging: a restored persistent entry doesn't come back with a generous TTL. It comes back at the network's `min_persistent_ttl` floor — currently 7 days (see table above) — so a stream that gets restored but isn't immediately touched by a state-changing call (which re-extends it) can archive again within a week.

### A live example of why every number here needs re-checking

The docs page quoted above also states, in the same section:

> The restored entry will have its live until ledger extended to the minimum the network allows for newly created entries, which is `current_ledger_number + 4095` for persistent entries. The minimum TTL value is a network configuration parameter and is subject to be updated (likely increased) via network upgrades.

4,095 ledgers is **not** what `stellar network settings --network testnet` reports today — the live value is 120,960, roughly 30× larger. The docs page's own prose warned this would drift, and it already has. This isn't a criticism of Stellar's documentation — it's the exact failure mode this research is supposed to prevent StelFlow from building against. Nothing in this document, and nothing in the eventual contract, should treat a written ledger-count as durable. See [§ Parameters that must not be hardcoded](#parameters-that-must-not-be-hardcoded).

## What extending (and restoring) costs

Every Soroban smart-contract transaction pays a **resource fee** on top of the classic inclusion fee, split into non-refundable (CPU, entry reads/writes, bandwidth) and refundable (rent, events, return value) components:

> Ledger space rent: the payment for the ledger entry TTL extensions (i.e., rent payments) and rent payments for increasing ledger entry size.
> — [Stellar docs: Fees, Resource Limits, and Metering](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering), checked 2026-08-11

Rent is not flat. It scales on two axes that matter directly for StelFlow's data layout:

1. **Entry size.** A bigger stored struct costs more to keep alive per ledger. This is the same pressure architecture.md's read-budget section already used to justify keeping milestones inline in the stream struct rather than as separate entries — and it cuts the other way here too: inlining milestones makes the *rent* per stream scale with milestone count, which is one more argument (alongside the read-budget one) for the still-open `MAX_MILESTONES_PER_STREAM` cap.
2. **Extension length**, in ledgers requested — bounded above by `max_entry_ttl` per call, as established above.

Both are then multiplied by a rate that isn't fixed either — it moves with total network storage demand:

> Write fees will grow gradually over time when the database size is below the ledger growth threshold and will grow linearly, but with a **1,000× factor** after exceeding that threshold.
> — [Stellar docs: Fees, Resource Limits, and Metering § Dynamic pricing for storage](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering), checked 2026-08-11

Testnet's current settings encode that curve as `rent_fee1_kb_soroban_state_size_low = -17000`, `rent_fee1_kb_soroban_state_size_high = 10000`, `soroban_state_rent_fee_growth_factor = 5000`, against a `soroban_state_target_size_bytes` of 4,000,000,000 (4 GB) — i.e. the per-KB rent rate is deliberately allowed to swing over roughly a 27-unit range depending on how full the network's storage is relative to that 4 GB target. The exact interpolation is implemented in the canonical fee-computation library the docs point to, not restated in prose anywhere — which is itself the right way to treat it: **the authoritative cost of any specific extension is whatever `simulateTransaction` returns for it right now, not a formula reproduced in a doc or a contract.**

What is safe to say without re-deriving the curve: the base, non-rent cost of touching one entry is small and roughly fixed — testnet's `fee_write_ledger_entry` (2,500 stroops), `fee_disk_read_ledger_entry` (1,563 stroops), and their per-KB counterparts are on the order of a few thousand stroops (≈0.0001–0.001 XLM) per entry, before rent. Rent is the variable, potentially-large component, and it's the one that scales with both stream size and how far out the extension reaches.

**Restoring costs the same shape of fee as extending**, plus it's a full write of the entry (not just a TTL bump), so it's at least as expensive as an equivalent extension and is priced through the same congestion-sensitive curve. It is not free, but it is a *single* payment made once, at the moment someone wants to use the stream again — which is the crux of the recommendation below.

## Options compared

### A. Extend-on-touch only (architecture.md's stated baseline)

**Mechanism:** every state-changing call (`withdraw`, `approve_milestone`) calls `extend_ttl` on its own entry.

**Cost:** bundled into a transaction the caller is already sending. No incremental transactions, ever.

**Failure mode:** this is necessary but not sufficient, and by itself guarantees archival of exactly the streams the issue is about. A stream with a 1-year cliff and no other activity is, by construction, untouched — there is no state-changing call to hang an extension on — until someone withdraws. It will archive well before then, since `max_entry_ttl` (~180 days) is shorter than the cliff.

### B. Aggressive extension at creation, maximized on every touch

**Mechanism:** `create_stream` (and every subsequent touch) sets `extend_to` to the current maximum allowed, rather than a small default — the contract already knows the stream's `duration` and cliff at creation time, so it can size the initial extension to the stream's own known dormancy window rather than a flat constant.

**Cost:** one extra write-bytes charge folded into the creation transaction the sender is already paying for (plus rent for the longer window, which is real money but a single line item, not a recurring bill). Same at each subsequent touch.

**Failure mode:** still bounded by `max_entry_ttl` from whenever the *last* touch happened — it cannot survive a 4-year gap in one shot. It converts "will definitely archive well before the cliff" into "will archive unless something touches it roughly every six months," which is a real improvement but not a solution on its own.

### C. Keeper / watcher service

**Mechanism:** a service (StelFlow-operated, sender-operated, or any third party — nothing prevents it, since `ExtendFootprintTTLOp` has no auth check) periodically calls `bump_stream` for dormant streams approaching their TTL floor. This is explicitly the pattern Stellar's own best-practices guidance recommends for state with no clear day-to-day owner:

> Owners of owned contracts should subsidize shared state TTL extension fees by manually submitting extend operations... This could be implemented via something like a cron job where an `ExtendFootprintTTLOp` for all relevant shared state is submitted periodically.
> — [Stellar docs: Persisting Data § Best Practices](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/persisting-data), checked 2026-08-11

**Cost:** paid by whoever runs it — ongoing, proportional to the number of dormant streams under watch.

**Failure mode:** it's a single point of reliance dressed up as decentralization-by-permissionlessness. If the service stops (funding lapses, the operator disappears), every stream it was covering silently reverts to option A's fate — and because nobody but the keeper was watching, there's no natural signal that it stopped. It's also genuinely more infrastructure than a v1 project should commit to operating: a keeper covering enough dormant streams to matter needs its own batching against the same per-transaction write-entry cap (`tx_max_write_ledger_entries` = 200 on testnet today) that already bounds `withdraw_many`/`bump_many` per architecture.md's read-budget section.

### D. Accept archival, optimize the restore-then-withdraw path

**Mechanism:** don't fight the TTL. Let genuinely dormant streams archive; make restoration as close to automatic and as cheap as the protocol allows, and put the (small, one-time) restore fee on the person who's motivated to pay it — the recipient, at the moment they actually want the money.

**Cost:** one restoration, paid once, exactly when needed — versus N periodic extensions paid by someone with no immediate stake in a specific dormant stream.

**Failure mode:** this is the option that fails loudly if the client software is bad at it. Architecture.md already names the risk correctly: "the SDK must detect an archived entry and produce a restore-then-withdraw flow, not a confusing 'stream not found'." As established above, Protocol 23 makes the detection step nearly free (it's a field in the simulation response) — the remaining risk is entirely in whether the SDK acts on that field and discloses the cost before signing, covered concretely below.

## Recommendation

**Combine B, a narrowed C, and D — deliberately not the full version of any single option:**

1. **Instance/shared storage** (contract-wide config) gets the most conservative treatment available: extend it unconditionally, generously, on every call that touches it, with no cost-benefit hesitation. It's one entry, cheap to keep alive, and losing it blocks *every* stream simultaneously — the asymmetry noted in [§ Storage types](#storage-types-briefly). This isn't new; it's confirming architecture.md's existing split between instance and persistent storage is the right place to draw this line and should stay that way.
2. **Per-stream persistent entries** keep architecture.md's extend-on-touch behavior (Option A) as the free default for active streams, unchanged.
3. **At creation**, size the initial extension to the stream's own cliff/duration rather than a flat default (Option B) — the information is free (already an argument to `create_stream`), and it directly reduces, for the specific case the issue names, how many unattended six-month windows a long stream has to survive.
4. **Keep `bump_stream` permissionless** so nothing stops a sender, a grantor, or a third party from running their own keeper — but **StelFlow does not build or operate one in v1** (Option C, deliberately not adopted as a project commitment). It's real, ongoing infrastructure with its own single-point-of-failure risk, it's out of scope per the issue, and nothing about the recommendation below depends on it existing.
5. **Invest the actual engineering effort in the SDK's restore-then-withdraw flow** (Option D), because that is where a real user hits this, per the issue's acceptance criteria — concrete guidance follows immediately below.

**What this gives up, explicitly:** no guarantee that any given stream survives its entire multi-year life without ever needing a restore. A sender who wants that stronger guarantee has to run their own keeper (nothing stops them) or accept that their recipient may see a small, disclosed restore step before their first withdrawal after a long gap. The alternative — StelFlow committing to run a keeper for every stream, indefinitely — is a support and funding obligation the project has no plan or budget for today, and would quietly promise a permanence the design doesn't actually have, in the same spirit architecture.md already warns against overstating for issuer clawback: say what the design guarantees, not what would be nice.

## Restore-then-withdraw: concrete guidance for the SDK

This is the flow the acceptance criteria call out as where users actually hit the problem, so it's specified at the level of "what the SDK does," not just the mechanism:

1. **Always simulate before asking a wallet to sign.** Build the `withdraw` invocation and call `simulateTransaction` first — never assemble a transaction from cached state and sign blind.
2. **Check the simulation result for a restore requirement**, not for a thrown error. On Protocol 23+ (confirmed live on testnet as of this check), a successful simulation of a call that touches an archived entry still succeeds, and carries a `restorePreamble` (the field the JS SDK's `Api.isSimulationRestore(sim)` checks) containing the exact footprint and fee needed to restore. There is nothing to catch-and-retry here; it's a normal, expected simulation field.
3. **Surface it to the user before signing anything**, not after a failed transaction: "This stream hasn't been touched in a while — restoring it costs an extra `[simulated fee]` before your withdrawal goes through." The fee is known precisely at this point because it came from simulation — never guess it, never round it to a flat estimate baked into the SDK.
4. **On confirmation, build and submit the restoration using the simulation's own `restorePreamble`** (its `transactionData` and `minResourceFee`) rather than hand-computing ledger keys. This is only for the ordinary "my stream's persistent entry archived" case.
5. **Immediately follow the restore with the original `withdraw` call** — do not leave a gap. A freshly restored entry only carries the network's minimum TTL (currently ~7 days), so a restore that isn't chained straight into the action that re-extends it (withdraw already does, per architecture.md) can archive again shortly after, forcing the recipient through this twice.
6. **Handle the rarer "contract instance/WASM archived" case separately**, not per-withdrawal — check for it at SDK initialization or a cold-start/"first use in a while" moment, since it requires an extra `getLedgerEntries` call for the WASM hash and a manually constructed footprint (the automatic restore-list only covers what simulation actually touches, and a fully-archived instance may need fetching before it can even be simulated against). This is StelFlow-wide, not stream-specific, and the SDK should isolate it from the common per-stream path so a rare, slightly heavier recovery doesn't complicate the common one.
7. **The contract itself needs no archived-entry handling at all.** A transaction that references an archived entry outside the restore list fails at the apply stage, before the contract's Rust code ever runs — there is no branch to write, and no reason to write archival-handling unit tests against contract logic. All of the work described here is client-side.
8. **If StelFlow ever supports submitting pre-built, unsimulated XDR** (e.g. offline signing, hardware-wallet flows that skip live simulation), that path does not get automatic restore-list population and needs the explicit three-step simulate → restore → retry loop that pre-Protocol-23 clients required. Don't assume every future entry point gets Protocol 23's convenience for free.

## Parameters that must not be hardcoded

Every ledger-count or fee figure in this document is a live network setting, checked once, on the date below. All of them can change at a protocol upgrade — the [4,095-vs-120,960 discrepancy](#a-live-example-of-why-every-number-here-needs-re-checking) above is proof one already has. None of them belong in the contract as a compiled-in constant.

| Parameter | Testnet value | Checked | Source |
|---|---|---|---|
| `state_archival.min_persistent_ttl` | 120,960 ledgers (~7 days) | 2026-08-11 | `stellar network settings --network testnet`; [CAP-0046-12](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-12.md) |
| `state_archival.max_entry_ttl` | 3,110,400 ledgers (~180 days) | 2026-08-11 | same |
| `state_archival.min_temporary_ttl` | 720 ledgers (~1 hour) | 2026-08-11 | same |
| `persistent_rent_rate_denominator` / `temp_rent_rate_denominator` | 1,215 / 2,430 | 2026-08-11 | same |
| `rent_fee1_kb_soroban_state_size_{low,high}`, `soroban_state_rent_fee_growth_factor`, `soroban_state_target_size_bytes` | -17,000 / 10,000 / 5,000 / 4,000,000,000 bytes | 2026-08-11 | same; formula implementation is the canonical fee library the [Fees & Metering docs](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering) point to, not restated in prose |
| `fee_write_ledger_entry` / `fee_disk_read_ledger_entry` | 2,500 / 1,563 stroops | 2026-08-11 | same |
| `fee_write1_kb` / `fee_disk_read1_kb` | 875 / 447 stroops | 2026-08-11 | same |
| `tx_max_disk_read_entries` / `tx_max_write_ledger_entries` | 200 / 200 | 2026-08-11 | same — matches architecture.md's SLP-0004 claim, corroborated live |
| `scp_timing.ledger_target_close_time_milliseconds` | 5,000 ms | 2026-08-11 | same — the 5s/ledger conversion used throughout this document is itself this parameter, not a constant |
| Network protocol version | Testnet: 27. Installed stellar-cli (23.4.1) fully understands protocol 23 only. | 2026-08-11 | `stellar --version`; CLI warning on `network settings` output |

**How the contract and SDK should actually use these**, rather than compiling any of the above in:

- **The contract** should not embed a specific `extend_to`/`threshold` ledger count as a `const`, and — since [#33](https://github.com/StelFlow-labs/StelFlow/issues/33) — should not store one as tunable config either. This bullet originally proposed keeping thresholds in `instance` storage, "mutable by whatever admin/governance process architecture.md's open question on upgradeability eventually settles." That question settled as **non-upgradeable, with no config admin of any kind** ([research/upgradeability-and-pause.md](upgradeability-and-pause.md)), so there is no process to make them mutable and a stored threshold would simply be a `const` in a more expensive place. Take the option this bullet already recommended as better practice: **derive the values at call time from `env.storage().max_ttl()`**, the host function Soroban exposes precisely so a contract can ask the *current* ceiling rather than assume one. A protocol upgrade that moves `max_entry_ttl` is then absorbed automatically, which is the property that made immutability affordable here in the first place.
- **The SDK** should never ship a hardcoded fee estimate for restoration or extension. The only correct source for "what will this cost right now" is `simulateTransaction` against the live network at call time — that's what step 3 of the [restore-then-withdraw flow](#restore-then-withdraw-concrete-guidance-for-the-sdk) above depends on. If the dashboard wants a rough number to show before a user commits to an action (e.g. "streams like this typically need re-extension every ~6 months"), it should be computed from a fresh `stellar network settings` / RPC config call, cached with a short TTL of its own, and labeled as an estimate.

## Resolving the architecture.md TODO

Architecture.md's TODO asked to "pick target TTL extension thresholds (`extend_to`/`threshold` ledgers) once you've priced rent for a realistic stream count." This document narrows, but doesn't fully close, that TODO:

- **Resolved:** the mechanism. Instance storage gets unconditional aggressive extension; per-stream persistent entries get extend-on-touch plus cliff-aware sizing at creation; `bump_stream` stays permissionless but StelFlow doesn't operate a keeper; archival past that point is accepted and handled by the SDK, not fought on-chain.
- **Still open, correctly:** the exact numeric thresholds (what multiple of the cliff duration to extend to at creation; what `threshold` value makes extend-on-touch a no-op often enough to matter). That genuinely needs measurement against real footprint sizes once the stream struct's on-chain layout exists — the same measurement architecture.md's other open TODO (`MAX_MILESTONES_PER_STREAM`, `MAX_BATCH_SIZE`) already calls for in Phase 1. Doing it now, against a struct that doesn't exist yet, would produce a number as fake as the one this document is trying to avoid.

The architecture.md TODO comment has been updated to point here and reflect this split.

## Sources checked on 2026-08-11

- [Stellar docs — State Archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
- [Stellar docs — Persisting Data](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/persisting-data)
- [Stellar docs — Fees, Resource Limits, and Metering](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering)
- [Stellar docs — Implement state archival in dapps](https://developers.stellar.org/docs/build/guides/dapps/state-archival)
- [CAP-0046-12 — Soroban State Archival Interface](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-12.md) (Status: Final)
- [CAP-0066 — Soroban In-memory Read Resource](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0066.md) (Status: Final, Protocol 23)
- `stellar network settings --network testnet` (stellar-cli 23.4.1, testnet reporting protocol 27)

## Next

- [../architecture.md](architecture.md) — the design this narrows.
- [../glossary.md](glossary.md) — TTL, state archival, RestoreFootprintOp definitions.
