# Security Policy

## Current status

**StelFlow has no deployed contracts, no audit, and no funds at risk.** Nothing in this repository executes anywhere. There is no production system to attack.

That means this policy is mostly forward-looking. It is here so the process exists before it's needed, not because there's something to report today.

Do not use anything in this repository with real value until this file says a deployment has been audited. When that changes, this section changes.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Preferred: GitHub's [private vulnerability reporting](https://github.com/StelFlow-labs/StelFlow/security/advisories/new). That creates a private advisory only maintainers can see.

If you can't or won't use GitHub, email **<jethroirmiya@gmail.com>** with `[StelFlow security]` in the subject.

<!-- TODO(maintainer): a PGP key is optional but some researchers expect one. Publish a fingerprint here if you set one up. -->

### What to include

- What breaks, and the impact — funds lost, funds stranded, unauthorized access, denial of withdrawal.
- Steps to reproduce, or a failing test case. A test case is the fastest way to get taken seriously.
- Which component: contract, SDK, indexer, or dashboard.
- Whether you've disclosed it anywhere else.

### What to expect

| | Target |
|---|---|
| Acknowledgement | 48 hours |
| Initial assessment | 5 business days |
| Fix or mitigation plan | Depends on severity; you'll get a written timeline |

If you don't hear back within 48 hours, escalate by mentioning a maintainer in a *public issue* — say only that you sent a private report and got no reply, with no details of the vulnerability itself.

These targets are what a small maintainer team can realistically hit. They are not a contractual SLA.

## Disclosure

Coordinated disclosure. We'll agree a date with you, and default to publishing once a fix is deployed or, for unfixable design issues, once it's documented. If a report affects users of another project — Trustless Work, an asset issuer, a wallet — we'll coordinate with them before publishing.

You will be credited in the advisory and in [CONTRIBUTORS.md](CONTRIBUTORS.md) unless you ask not to be.

## Scope

**In scope** (once code exists):

- The StelFlow Soroban contracts — accrual math, authorization, storage, milestone gating, cancellation
- The TypeScript SDK, where a flaw causes a user to sign something other than what they intended
- The indexer, where a flaw causes it to report balances that don't match the chain
- The dashboard, where a flaw leads a user to sign a harmful transaction

**Out of scope:**

- Stellar Core, Soroban host functions, Stellar RPC — report those to the [Stellar Development Foundation](https://github.com/stellar/stellar-core/security/policy)
- Third-party assets and their issuers, including issuer clawback. If an asset has clawback enabled, its issuer can remove funds from a live stream. That's an asset property, disclosed in [docs/concepts.md](concepts.md#cancellation-and-clawback), not a StelFlow bug — the threat model covers it as [T7](threat-model.md#t7--issuer-clawback), accepted rather than fixable
- Trustless Work's contracts — report to [Trustless Work](https://github.com/Trustless-Work)
- Wallets, and phishing that doesn't involve a flaw in our code
- Findings from an automated scanner with no demonstrated impact

## What we care most about

The reasoning behind this list, threat by threat, is in
[docs/research/threat-model.md](threat-model.md) — including which risks are accepted
rather than mitigated, and the design decisions that are still open. Two of its highest-ranked
threats were closed by *removing* the capability rather than guarding it, which is why the list below
now includes attacks on those limits themselves. Start there if you're looking for somewhere to dig.

If you're deciding where to look, these are the classes that would hurt most:

1. **Value leakage.** Any sequence where withdrawals plus refunds plus remaining balance doesn't equal deposits. Note that this is a *closure* check across the whole contract: it still balances if one stream is paid out of another's deposit, so we care separately about any payout exceeding its own stream's `total - withdrawn`. The contract's token balance is pooled, and that assertion is what keeps streams isolated from each other.
2. **Stranded funds.** Any state where an earned balance can never be withdrawn — including resource exhaustion, where a stream grows large enough that a withdrawal exceeds the transaction's read or instruction budget.
3. **Authorization bypass.** Withdrawing as a non-recipient, approving as a non-approver, or cancelling a non-cancelable stream without **both** the sender's and the recipient's authorization.
4. **Accrual manipulation.** Anything that makes the contract compute a claimable balance that doesn't match elapsed ledger time.
5. **Archival traps.** A stream that archives into a state it can't be correctly restored from.
6. **Escaping the limits on privilege.** The contract is [non-upgradeable and has no admin over funds](upgradeability-and-pause.md); the sole global role can only stop `create_stream`, auto-expires, and can be renounced. So: any path that creates a stream while paused, a pause that fails to expire, a way to restore a renounced pauser, or anything that lets a privileged address reach a stream it isn't a party to.

## Bug bounty

None yet. Planned for Phase 7, "Hardening and audit" — see [ROADMAP.md](ROADMAP.md). We're not going to pretend a bounty exists before it's funded.

<!-- TODO(maintainer): if a grant funds a bounty, replace this section with the real scope, reward tiers, and the platform hosting it. -->

## Supported versions

Nothing is released, so nothing is supported. Once there's a tagged release, this becomes a table of versions and their support status.
