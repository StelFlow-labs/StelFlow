# FAQ

Questions a developer or a treasurer actually asks, answered from what the design says today.

**Nothing here is built.** There are no contracts, no deployment, and no audit — see [SECURITY.md](../SECURITY.md#current-status). Every answer below describes intended behavior, and where the design hasn't decided something, the answer says so and links the open question rather than inventing a confident one.

## The basics

### How is this different from just sending 12 monthly payments?

Someone has to sign those 12 transactions on schedule. If that person leaves, loses their key, or forgets, the recipient stops getting paid, and there is no on-chain guarantee that months 7–12 will ever arrive. A stream removes the signer: the sender deposits the whole amount once, and from then on the recipient's balance rises because ledger time rises — [no job runs and nothing is scheduled](concepts.md#money-streaming). The recipient also gets paid continuously rather than in monthly steps, so they aren't waiting on a date to make rent. The tradeoff is that the money is committed up front, which is the point: [that commitment is what makes the guarantee real](concepts.md#how-this-differs-from-what-already-exists).

### What assets can I stream?

Anything implementing the [SEP-41 token interface](architecture.md#sep-41-assets), which includes the Stellar Asset Contract — so any classic Stellar asset, USDC included, works through its SAC wrapper, alongside purpose-built Soroban tokens. Two limits are worth knowing before you pick one. SEP-41 is still a Draft SEP, so the contract is meant to depend only on the functions it actually calls rather than the full surface. And **fee-on-transfer or rebasing tokens break accrual accounting** — the contract would end up holding less than the stream promises. Whether `create_stream` will reject those by verifying the received balance, or whether they'll simply be documented as unsupported, is [an open TODO in the design](architecture.md#sep-41-assets).

### When can I use it?

There is no date, deliberately. [ROADMAP.md](../ROADMAP.md) sequences the work by dependency rather than by calendar, and it is currently on Phase 0 of 8 — design and docs. Usable-on-testnet is Phase 1; milestones and cancellation are Phase 2; mainnet is Phase 8, gated behind an external audit in Phase 7. The roadmap is explicit that mainnet is done "when there is a mainnet address in the README and it's the real one," and there isn't one. If you need a date for a funding or planning decision, treat the answer as "not soon enough to plan around."

## Receiving a stream

### What happens if I never withdraw?

Nothing bad, and nothing is lost. Accrual is [computed rather than pushed](concepts.md#money-streaming), so not withdrawing costs you nothing and your balance keeps rising on its own until the end of the stream. The one real consequence is Soroban's [state archival](architecture.md#storage-type-and-ttl): a stream's entry has a TTL, and a stream nobody touches for long enough — a 4-year vesting stream with a 1-year cliff, say — will archive.

Archived is not deleted. Stream state lives in `persistent` storage precisely because those entries are archived rather than destroyed, and a `RestoreFootprintOp` brings the entry back for a fee, after which you withdraw normally. Every state-changing call extends the TTL, so a stream you use regularly keeps itself alive for free, and a public `bump_stream` entry point lets _anyone_ — the sender, a watcher service — keep a dormant stream hot without you doing anything. Handling this cleanly is a [named, non-optional requirement on the SDK](../ROADMAP.md#phase-4--typescript-sdk-), so you should get a restore-then-withdraw flow rather than a confusing "stream not found."

### What does a withdrawal cost, and does withdrawing more often cost me more?

Each withdrawal is an ordinary Stellar transaction, so it costs a transaction fee, paid by you. Withdrawing more often costs more in aggregate fees, but it [changes nothing about the total you receive](concepts.md#money-streaming) — the formula doesn't care how many times you settle against it. Withdraw daily for cash flow or once at the end to minimize fees; the arithmetic is identical either way.

No concrete figure exists, because nothing is deployed and Soroban fees depend on live network settings rather than constants. One concrete thing that _is_ known: [resolution is a ledger, not a second](architecture.md#ledger-time-is-the-clock), so two withdrawals inside the same ledger see an identical timestamp and the second is a no-op — you'd pay a fee for nothing.

### Can the sender take back money I've already earned?

No. On cancellation, accrual freezes at that ledger's timestamp, and your streamed-but-unwithdrawn balance [stays yours to withdraw — it does not get swept](concepts.md#cancellation-and-clawback). Only the unstreamed remainder goes back to the sender. Streams can also be created non-cancelable, which is the recommended default for vesting; whether yours is cancelable is fixed at creation and can't be changed afterwards.

**One caveat that matters, and it cuts against you:** funds sitting behind an _unapproved_ milestone gate do not count as earned. They accrue, but on cancellation an unmet milestone's tranche is treated as unstreamed and returns to the sender — the reasoning being that an unmet milestone is work that didn't happen. So "already earned" means streamed _and_ released by any gate over it, not merely accrued. If a large share of your stream is milestone-gated, that share is at risk until it's approved.

### What happens if the approver disappears and never marks a milestone met?

Your base portion is unaffected and keeps paying — that separation is the whole design intent, so [the recipient always has the base stream to live on](concepts.md#milestone-gates). The gated tranche keeps accruing but stays unclaimable, and since a gate [doesn't extend the stream](concepts.md#what-a-gate-does-not-do), it simply sits at its full amount once the end time passes, waiting on an approval that isn't coming.

Beyond that, **the design does not currently answer this.** There is no timeout, no fallback approver, and no mechanism for replacing one described anywhere in `docs/`. In practice that leaves one exit: if the stream is cancelable, the sender cancels and the unapproved tranche returns to them, which resolves the stranded funds but resolves them in the sender's favor. If the stream is non-cancelable, nothing in the design releases those funds to anyone. This isn't among the [open questions in architecture.md](architecture.md#open-questions) yet, and arguably should be — a dead approver is a stranded-funds scenario, which is [the second-highest concern in SECURITY.md](../SECURITY.md#what-we-care-most-about).

### What happens if I lose access to the recipient account?

The earned funds become unreachable. `withdraw` [requires authorization from the recipient address](architecture.md#authorization), roles are stored per stream, and there is deliberately no global admin over user funds — which is the property that stops anyone else from taking your money, and the same property that means nobody can recover it for you. No recipient-reassignment path is described in the design.

Cancellation does not rescue this. If the sender cancels, your earned balance [stays assigned to you rather than being swept back](concepts.md#cancellation-and-clawback), so it stays exactly as unreachable as before; only the unstreamed part returns to the sender. This is ordinary self-custody risk rather than a StelFlow-specific one, and wallet-level key loss is [explicitly out of scope in SECURITY.md](../SECURITY.md#scope) — but it's worth stating plainly rather than leaving you to discover it.

## Funding a stream

### Can I stream to more than one recipient?

Not from a single stream. A stream is [one sender → one recipient, one asset, one schedule](concepts.md#money-streaming), and splitting one N ways multiplies the per-transaction entry cost, which runs into [the read budget that shapes the whole storage design](architecture.md#the-per-transaction-read-budget). Multi-recipient streams are [explicitly deferred](../ROADMAP.md#not-on-the-roadmap), pending that entry-cost question, and listed as [an open question](architecture.md#open-questions) where the maintainer invites disagreement — so if you have the payroll use case, arguing for it in an issue is a genuinely useful contribution.

For now the intended answer is N separate streams, with bounded batch entry points (`withdraw_many`, `bump_many`) planned so that operating them doesn't mean N transactions for every action.

### Can I change a stream after it's created?

No. The design describes no entry point for changing a stream's amount, schedule, or recipient — [StelFlow Core's responsibilities](architecture.md#components) are create, compute, withdraw, approve, and cancel, and nothing else. The cancelable flag is [set at creation and immutable after](../ROADMAP.md#phase-2--milestones-and-cancellation-), and the milestone cap is enforced at creation too.

If terms need to change, the path is to cancel — which returns the unstreamed remainder to you and leaves the recipient their earned balance — and create a new stream on the new terms. That only works if the stream was created cancelable, so if you expect renegotiation, don't create it non-cancelable.

## Risk and status

### Can the asset issuer freeze or claw back a live stream?

**Yes, if the asset allows it, and StelFlow cannot prevent it.** This is the honest answer and it's worth reading twice: an asset issuer with clawback enabled can remove funds the contract is holding for a live stream, _including funds a recipient has already earned_. The design states this without hedging — [issuer clawback is out of scope and cannot be defended against](architecture.md#sep-41-assets) — and SECURITY.md puts it [out of scope as an asset property rather than a StelFlow bug](../SECURITY.md#scope). It is a disclosure problem, not a code problem: the contract is not supposed to treat its stored `total` as a guarantee, because `balance` is the truth.

Note that this is a different thing from StelFlow's own [clawback on cancellation](concepts.md#cancellation-and-clawback), which reaches only the unstreamed remainder and can never touch earned funds. Same word, unrelated powers.

Practically: **check the asset's flags before you rely on a stream denominated in it.** A dashboard warning for clawback-enabled assets is planned in [Phase 5](../ROADMAP.md#phase-5--dashboard-), which means it does not exist and you are checking manually. On freezing specifically, `docs/` currently addresses clawback but not authorization revocation; per [Stellar's SAC documentation](https://developers.stellar.org/docs/tokens/stellar-asset-contract#interacting-with-classic-stellar-assets), transfers of a classic asset succeed only while the relevant trustlines are authorized, so an issuer that can freeze a holder is in the same family of power. Treat that as a property of the asset you chose, and read it here as a pointer to Stellar's docs rather than as a settled StelFlow design claim.

### Is this audited?

No. There are no contracts to audit — nothing in this repository executes anywhere, and [SECURITY.md says so directly](../SECURITY.md#current-status): no deployed contracts, no audit, no funds at risk. Its instruction is unambiguous: do not use anything in this repository with real value until that file says a deployment has been audited.

An external audit is [Phase 7](../ROADMAP.md#phase-7--hardening-and-audit-), after property-based tests, fuzzing, and an internal review against a written threat model, and the phase is done only when an audit report is published in this repository, findings and all. Two honest notes on that: Phase 7 is six phases away, and the roadmap carries an unresolved TODO asking the maintainer to state how an audit would be funded — so it is a stated intention, not a booked engagement.

## Didn't find your question?

If the answer isn't here and isn't in [concepts.md](concepts.md) or [architecture.md](architecture.md), open an issue. Questions that expose an undecided design point are useful — [architecture.md ends with five open questions](architecture.md#open-questions) that got there the same way.

For anything that looks like a vulnerability, don't open an issue — follow [SECURITY.md](../SECURITY.md#reporting-a-vulnerability) instead.
