# Roadmap

Where StelFlow is going and in what order. Phases are sequenced by dependency, not by date — each one exists because the next one can't be built without it.

**Phases 0 to 2 are built and on testnet; Phase 5's dashboard is built alongside them.** Everything else is still planned. When something ships, its checkbox gets ticked and this line gets narrower.

<!-- TODO(maintainer): add target dates or a funding milestone mapping if this feeds a grant application. Leaving them out is honest; a reviewer will ask, so decide what you can actually commit to. -->

## Status at a glance

| Phase | Scope | Status |
|---|---|---|
| 0 | Design and docs | 🟢 Done |
| 1 | Contract core | 🟢 Done — on testnet |
| 2 | Milestones and cancellation | 🟢 Done — on testnet |
| 3 | Indexer | ⚪ Not started — the dashboard reads RPC directly for now |
| 4 | TypeScript SDK | 🟡 Bindings generated; the convenience layer above them is not built |
| 5 | Dashboard | 🟢 Done — every entry point is driveable |
| 6 | Trustless Work integration | ⚪ Not started, and not yet discussed with them |
| 7 | Hardening and audit | ⚪ Not started — **the gate before mainnet** |
| 8 | Mainnet | ⚪ Not started |

Phases 3 and 4 were skipped rather than completed. The dashboard folds RPC's
event log directly, which works at this scale and is honest about its limit: RPC
retains a rolling window, so the activity feed shows recent activity rather than
full history. [indexer-design.md](indexer-design.md) specifies the service for
when that stops being enough.

---

## Phase 0 — Design and docs 🟢

Get the design written down well enough that someone can disagree with it specifically.

- [x] README, concepts, architecture
- [x] Contribution setup — templates, code of conduct, security policy
- [x] Resolve the open questions in [docs/architecture.md](architecture.md#open-questions): milestone revocation (#17), upgradeability and pausing (#33), milestone deadlines (#38), and stream IDs (a monotonic counter, settled by implementing it). Multiple recipients per stream stays deliberately out of scope for v1.
- [x] ~~Write the contract interface as a Rust trait with no implementation~~ — superseded. [behaviour.md](behaviour.md) turned out to be the better artefact for the same purpose: it pinned the semantics before any code existed, and became the test suite directly.
- [x] Decide the workspace layout — Cargo workspace under `contracts/`, pnpm workspace over `apps/` and `packages/`

**Done when:** the interface is agreed and the open questions have answers in the docs, not in someone's head.

## Phase 1 — Contract core 🟢

The minimum thing that is genuinely a payment stream: linear accrual against ledger time, with withdrawal.

- [x] Cargo workspace, `soroban-sdk`, CI building to `wasm32v1-none`
- [x] Stream storage — one `persistent` entry per stream, `instance` storage for config
- [x] `create_stream` — full deposit pulled up front via SEP-41 `transfer_from`
- [x] Claimable-balance math in `i128`, multiply-before-divide, round down, end-of-stream settles to the exact remainder
- [x] `withdraw` — "withdraw what's available," not a fixed amount
- [x] Cliff support
- [x] TTL extension on every state-changing call, plus a public `bump_stream`
- [x] Events for every state change, designed for the indexer before the indexer exists
- [x] Unit tests against a mocked ledger clock, including: withdrawing twice in one ledger, withdrawing at exactly `start` and exactly `end`, a stream of duration 1, and a stream whose total doesn't divide evenly by its duration — [docs/specs/behaviour.md](behaviour.md) has these written out as Given/When/Then scenarios already, use it as the checklist
- [x] Measure real footprint sizes and set `MAX_MILESTONES_PER_STREAM` and `MAX_BATCH_SIZE` from measurement

**Done when:** a stream can be created and fully withdrawn on testnet, and the sum of withdrawals equals the deposit exactly, with no dust stranded.

## Phase 2 — Milestones and cancellation 🟢

What makes this StelFlow rather than a Sablier port.

- [x] Milestone struct stored inline in the stream entry, capped in count
- [x] `approve_milestone`, authorized against a per-milestone approver address
- [x] Gated claimable math — locked tranches accrue but don't pay out; approval releases accrued-to-date immediately
- [x] Cancelable flag, set at creation and immutable after
- [x] `cancel` — freeze accrual, recipient keeps earned, sender recovers unstreamed and unapproved tranches
- [x] Milestone revocation, or an explicit documented decision not to support it
- [x] Tests for the ugly cases: cancel with a pending approval in flight, approval after the end time, approval of a milestone on a canceled stream, cancel with zero elapsed time

**Done when:** the grant scenario in [docs/concepts.md](concepts.md#milestone-gates) runs end-to-end on testnet, including a cancellation partway through.

## Phase 3 — Indexer ⚪

Contract events into queryable history.

- [ ] Event ingestion from Stellar RPC, with resumable cursors
- [ ] Schema for streams, withdrawals, milestone transitions
- [ ] Reorg and replay handling — reprocessing the same events must be idempotent
- [ ] Backfill path that survives RPC's bounded event retention window
- [ ] Read API: streams by sender, by recipient, by approver; withdrawal timelines; treasury aggregates
- [ ] Reconciliation job that compares indexed state against on-chain state and alerts on drift

**Done when:** the indexer can be wiped and rebuilt from chain data to a byte-identical state.

## Phase 4 — TypeScript SDK ⚪

- [ ] Typed bindings generated from the contract spec, regenerated in CI so drift breaks the build
- [ ] Local accrual preview — recompute claimable client-side from stream state for live UI, without an RPC call per tick
- [ ] Transaction builders with correct auth entries for each role
- [ ] **Archived-entry handling** — detect an archived stream and produce a restore-then-withdraw flow. Not optional; see [docs/architecture.md](architecture.md#storage-type-and-ttl)
- [ ] Batch chunking against live network limits rather than hardcoded constants
- [ ] Indexer client
- [ ] Tests that assert the SDK's local accrual math matches the contract's exactly across fuzzed inputs

**Done when:** a developer can create, monitor, and withdraw a stream without reading the contract source.

## Phase 5 — Dashboard 🟢

Built earlier than the roadmap's order implies, because a contract nobody can
drive is hard to evaluate. Phases 3 and 4 were skipped rather than done.

- [x] Wallet connection — Stellar Wallets Kit, browser-extension wallets only
- [x] Sender view — create streams, watch outflow, cancel
- [x] Recipient view — live accrual, withdraw, milestone status
- [x] Approver view — pending milestones, approve
- [x] Degraded mode — claimable comes from simulating a contract read, so it
      works with no indexer at all, which is the state it currently runs in
- [x] Clawback warning when a stream's asset has issuer clawback enabled, plus an
      inline warning when the sender names themselves approver — the disclosure
      [T6 and T7](threat-model.md#t7--issuer-clawback) say those acceptances
      depend on. Both fire before the deposit is escrowed, since that is the
      irreversible step.
- [ ] Streams created from a CSV, for payroll runs

Roles are not separate views: the interface shows the actions your connected
address is actually entitled to on each stream, which turned out to be simpler
and to remove the "which view am I meant to be in" question entirely.

**Done when:** someone who has never used a CLI can receive a grant through it.
There is now a landing page that explains the idea without jargon and a
[step-by-step walkthrough](../TESTING.md). CSV payroll runs are the remaining
item, and they are a convenience rather than a gap in the story.

## Phase 6 — Trustless Work integration ⚪

- [ ] Confirm the integration surface — cross-contract approver call vs. off-chain agent (see the TODO in [docs/architecture.md](architecture.md#trustless-work-integration))
- [ ] Escrow-as-approver: a Trustless Work escrow address acting as the approver on gated milestones
- [ ] Reference implementation of the grant-disbursement flow end to end
- [ ] Joint documentation, reviewed by Trustless Work rather than written at them

**Done when:** a grant can run its approval process in Trustless Work while StelFlow streams the base allocation.

## Phase 7 — Hardening and audit ⚪

- [ ] Property-based tests: conservation of value (deposits always equal withdrawals plus refunds plus remaining balance) across randomized operation sequences
- [ ] Fuzzing on the accrual math for overflow and rounding drift
- [ ] Internal review against a written threat model
- [ ] External audit
- [ ] Public testnet period with real users and real assets, long enough to cross a TTL archival boundary
- [ ] Bug bounty

**Done when:** an audit report is published in this repository, findings and all.

<!-- TODO(maintainer): audits cost real money. Note the intended funding source, or say it's unfunded. Don't leave a reviewer to assume it's covered. -->

## Phase 8 — Mainnet ⚪

- [ ] Deployment with published, verifiable Wasm hashes
- [ ] Reproducible builds so anyone can confirm the deployed Wasm matches this source
- [x] Documented upgrade or migration policy, decided in Phase 0 — [non-upgradeable, with migration by cancel-and-recreate](upgradeability-and-pause.md). What remains for this phase is *executing* it: publishing the policy where users see it before they sign, not deciding it.
- [ ] Monitoring and incident runbook

**Done when:** there is a mainnet address in the README and it's the real one.

---

## Not on the roadmap

Stated so nobody builds them by accident:

- **A token.** StelFlow streams other people's assets. It doesn't need one.
- **Protocol fees.** Not in v1. Adding a fee later is a governance decision that needs a real discussion, not a constant someone slips into a PR.
- **Cross-chain streaming.** Out of scope.
- **Dispute resolution.** That's Trustless Work's job. Integrate, don't reimplement.
- **Multi-recipient streams.** Deferred pending the entry-cost question in [docs/architecture.md](architecture.md#open-questions). Argue for it in an issue if you have the use case.
