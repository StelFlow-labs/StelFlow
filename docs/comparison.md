# What already exists

Answers [issue #2](https://github.com/StelFlow-labs/StelFlow/issues/2), which was opened to test an
unverified claim in this project's own README.

**Every factual statement below was checked on 2026-08-16 and links to its source.** Repositories
move; re-check before quoting any of this in a grant application.

## The claim being tested

The README asserted that existing Soroban streaming projects are hackathon-scale, and that none
combine milestone gating with cancellation and escrow integration.

**Half of that was wrong, and it is the half that was convenient.** The two Soroban-native projects
named in the issue are *not* abandoned hackathon builds — both were pushed to within the last week
and both carry active contributor programmes. The README has been corrected.

The other half held up: neither implements milestone-gated tranches.

## The survey

### Sablier — EVM, the reference implementation

[Docs](https://docs.sablier.com/concepts/sablier-protocol) ·
[Governance](https://docs.sablier.com/concepts/governance)

The most mature token-streaming protocol anywhere, and the direct ancestor of StelFlow's accrual
model. Sablier Lockup offers linear, dynamic, and *tranched* stream shapes.

**Tranched is not milestone gating, and the distinction is the whole point.** A Sablier tranche
unlocks on a schedule — the passage of time releases it. A StelFlow milestone unlocks when a *named
approver signs*, and until they do, the tranche accrues but stays unclaimable. One is a clock; the
other is a decision.

Worth recording for a different reason: **Sablier V2 shipped its core contracts non-upgradeable**,
which is the same call StelFlow made in [#33](upgradeability-and-pause.md). Their docs put it
plainly — the protocol "is not upgradeable, meaning that no party can pause the contracts, reverse
transactions, or alter the users' streams in any way." A Protocol Admin exists and holds specific
functions, but cannot touch streams users have created. That is close to StelFlow's split, where the
one global role can stop `create_stream` and reach nothing else. It is useful prior art that the
immutable-core-plus-narrow-admin shape is deployable rather than merely principled.

### LlamaPay — EVM, a genuinely different funding model

[Debt docs](https://docs.llamapay.io/llamapay/features/debt) ·
[Repo](https://github.com/LlamaPay/llamapay)

LlamaPay is the one entry here that is not a variation on the same idea, and it is worth
understanding before assuming full escrow is obviously right.

StelFlow, Sablier and both Soroban projects are **closed-ended**: the sender escrows the entire
amount at creation, and the contract holds it. LlamaPay is **open-ended**: the payer keeps a shared
balance that many streams draw from, and if it runs dry the sender simply accrues debt. Their docs:
"instead of losing money and having to go through the work of restarting the streams, you incur
debt. The next time you deposit, the debt is paid and streams keep working as usual." No
liquidators, no cancellation bots.

**The trade, stated fairly.** Open-ended is dramatically more capital-efficient for a payroll of many
recipients — a DAO does not lock a year of salaries to pay monthly. Closed-ended gives the recipient
a guarantee that open-ended cannot: the money is already there. For milestone-gated work, where a
tranche may sit unclaimed for months while an approver deliberates, the guarantee is the product.
StelFlow's [use-case pages](use-case-dao-payroll.md) name this as the real cost of the design.

### StellarStream — Soroban, active

[Repo](https://github.com/StellarStream-HQ/StellarStream) ·
[Demo](https://stellar-stream.netlify.app/)

Note the repository moved: the `Folex1275/StellarStream` link in the issue now redirects to
`StellarStream-HQ/StellarStream`.

Real-time payroll on Soroban, second-by-second linear distribution, non-custodial. Cancellation
refunds the sender whatever is unearned — the same rule as StelFlow's, settled atomically at
cancellation.

**Status on 2026-08-16:** last push 2026-08-15, 5 stars, 167 forks, 103 open issues. That
fork-to-star ratio with a large open-issue count is the signature of an organised contributor
programme rather than a solo hackathon entry, and it should be read as a sign of activity.

**No milestone gating.** The design is time-based linear vesting throughout. No published contract
address on mainnet or testnet in the README, so the deployed state could not be verified.

### stellar-stream — Soroban, active, earlier stage

[Repo](https://github.com/ritik4ever/stellar-stream) ·
[Demo](https://stellar-stream-indol.vercel.app)

Linear vesting on Soroban with a `cancel` path. Testnet-targeted, with no published contract ID —
the README instructs you to deploy your own.

**Status on 2026-08-16:** last push 2026-08-10, 5 stars, 168 forks, 203 open issues. Its own README
is candid about the gaps: the contract "is not fully connected to backend execution path yet" and
the wallet signing flow "is not active yet in UI."

That candour is worth crediting rather than scoring against. It is the same disclosure StelFlow's own
README made for months while nothing was built.

**No milestone gating.**

## The comparison

StelFlow's three claimed differentiators, marked honestly.

| | Milestone gating (approver-signed) | Cancellation with refund | Escrow integration |
|---|---|---|---|
| **Sablier** | ✗ — tranches unlock on a clock, not a signature | ✓ | ✗ |
| **LlamaPay** | ✗ | n/a — open-ended, nothing to refund | ✗ |
| **StellarStream** | ✗ | ✓ | ✗ |
| **stellar-stream** | ✗ | partial — `cancel` exists, refund mechanics undocumented | ✗ |
| **StelFlow** | ✓ | ✓ | intended, [not yet built](architecture.md#trustless-work-integration) |

The escrow-integration column is the one where StelFlow must not claim a win. The Trustless Work
integration is a *design intention* — an approver may be a contract address, which is the mechanism
that would make it work — and no integration exists or has been discussed with them. It is marked
"intended" and should stay that way until it is real.

## Where this leaves StelFlow

Written to survive a hostile reader.

**The differentiator is real but narrow.** Approver-gated milestones genuinely do not exist in any of
the four. That is one feature, not a category. Everything else StelFlow does — linear accrual,
cliffs, cancellation with refund — is well-trodden, and two projects already do it on Soroban.

**"First on Soroban" is not available and was never claimed.** Both Soroban projects predate this
one. StelFlow's contract went live on testnet on 2026-08-16; theirs have been in development since
February.

**The strongest honest positioning is the design record, not the feature list.** What StelFlow has
that the others do not publish is a written, arguable account of *why* each decision was made — a
[threat model](threat-model.md) that ranks its own unmitigated risks, an
[upgradeability decision](upgradeability-and-pause.md) that rejects the conventional answer on
arithmetic, and [behaviour specs](behaviour.md) written before the code so the tests could not be
shaped to fit it. That is a claim about process, which is checkable, rather than about being first,
which is not.

**What would change this assessment.** If either Soroban project ships approver-gated milestones, the
one differentiator is gone and StelFlow should say so here rather than quietly leaving this page
stale. Both are active enough that it is a live possibility.

## Next

- [concepts.md](concepts.md#how-this-differs-from-what-already-exists) — the comparison table this
  page is the evidence for.
- [architecture.md](architecture.md#trustless-work-integration) — the escrow integration, described
  as intended rather than existing.
- [../README.md](../README.md) — corrected against these findings.
