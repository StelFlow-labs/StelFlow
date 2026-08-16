# StelFlow Core

Payment streaming with milestone gates, on Soroban.

A stream pays a recipient continuously over time. Part of it can be gated behind
milestones, which accrue on schedule but stay unclaimable until a named approver
opens them. Nothing is pushed: balances rise because the ledger's clock rises,
and every figure is recomputed from the original deposit on each call rather than
accumulated, so integer truncation never compounds.

## Entry points

| Function | Who authorizes | What it does |
|---|---|---|
| `create_stream` | sender | Escrows the deposit and opens a stream. Stores the **measured** balance delta, not the requested amount. |
| `withdraw` | recipient | Pays out everything currently claimable. |
| `approve_milestone` | that milestone's approver | Opens a gate, releasing accrual that has already happened. |
| `cancel` | sender — **and the recipient** when `cancelable = false` | Freezes accrual and settles both sides. |
| `touch` | anyone | Extends a stream's TTL. Permissionless by design. |
| `pause` / `unpause` / `transfer_pauser` / `renounce_pauser` | pauser | Reaches `create_stream` and nothing else. |

## The three properties worth knowing

**There is no upgrade function.** Only a contract can replace its own Wasm, so an
absent function is permanent immutability rather than a policy needing
enforcement. A timelocked upgrade was considered and rejected on arithmetic: a
timelock protects only what a recipient can withdraw during it, and a stream's
defining property is that most of the money is not withdrawable yet.

**The pause cannot reach an existing stream.** It gates `create_stream` alone. It
also expires by itself after 30 days and can be renounced permanently — both
because a stuck pause could never be patched out of a contract that cannot be
upgraded.

**No role has power over anyone's funds.** Authorization is per stream: sender,
recipient, and each milestone's own approver. The pauser is the only global role
and it can only stop new streams being created.

## Layout

- `accrual.rs` — the maths. Pure functions over a `Stream` and a timestamp.
- `types.rs` — storage layout.
- `storage.rs` — reads, writes, and TTL policy in one place, so no entry point
  can load a stream and forget to extend it.
- `events.rs` — the read path the dashboard folds.
- `error.rs` — one code per failure, so the SDK can say *why*.

Design reasoning lives in [`docs/`](../../docs): start with
[`concepts.md`](../../docs/concepts.md), then
[`architecture.md`](../../docs/architecture.md). Every non-obvious decision in
this crate has a document behind it and the code points at it.
