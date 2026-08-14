# Contributing to StelFlow

Thanks for looking. This is an early project — the contracts aren't written yet — which changes what's useful. A well-argued issue about the storage layout is worth more right now than a PR fixing a typo. Both are welcome, but calibrate accordingly.

Read [docs/architecture.md](docs/architecture.md) before contributing code. It explains why the design looks the way it does, and most "why don't you just..." questions are answered there.

## Where to start

**Reviewing the design.** [docs/architecture.md](docs/architecture.md#open-questions) ends with five open questions. If you've built on Soroban and have an opinion on any of them, open an issue. Concrete disagreement is the most valuable thing you can send at this stage.

**Picking up an issue.** Issues are labeled by difficulty and area:

| Label | What it means |
|---|---|
| `good first issue` | Scoped so you don't need the whole design in your head. Every one has acceptance criteria written out. |
| `help wanted` | Real work, needs some context. |
| `design` | No code — a decision that needs input. |
| `area: contract` / `area: sdk` / `area: indexer` / `area: dashboard` / `area: docs` | Which part of the system. |
| `blocked` | Depends on an unfinished phase. Don't start these. |

**Before you write code, comment on the issue saying you're taking it.** A maintainer will assign it to you. This costs you ten seconds and prevents two people shipping the same thing. If you go quiet for two weeks the issue gets unassigned — no hard feelings, just say so if you want it back.

What happens if you skip that step, since the rule is only useful if you know what it costs you:

- **A PR on an unassigned issue still gets reviewed.** You won't be turned away for missing the comment. The claim exists to stop duplicated effort, and if nobody else was working on it, nothing was lost.
- **A PR on an issue assigned to someone else does not.** The assignee has right of way until they're unassigned, whoever pushed code first. If you have most of a solution already, say so on the issue and we'll sort it out — but don't assume that arriving with a finished diff wins the issue.
- **If two unclaimed PRs land on one issue, the earlier claim wins; with no claim at all, the earlier PR does.** The other author gets first refusal on a related issue. This is a tiebreak, not a race to publish — nobody benefits from two people burning a weekend on the same doc.

Claiming is one comment. It is the cheapest thing in this process and the only one that protects your time rather than ours.

If nothing fits, open an issue describing what you want to do before building it. An unsolicited large PR is likely to conflict with something in the roadmap and get rejected on scope, which wastes your time more than it wastes ours.

## Local setup

Nothing in this repo builds yet — Phase 1 is where contract crates arrive, see
[ROADMAP.md](ROADMAP.md). What you need in the meantime, verified end-to-end by actually running
it rather than transcribed from documentation, lives in
[docs/dev-setup.md](docs/dev-setup.md): Rust, `wasm32v1-none`, `stellar-cli`, Node/pnpm, a funded
testnet identity, and the commands to check current network limits. Start there.

<!-- TODO(maintainer): pin the exact Node version in .nvmrc and the package manager version in package.json#packageManager once the SDK/dashboard workspace exists. -->

## Branches

Branch from `main`. Name branches `<type>/<short-description>`:

```
feat/milestone-approval
fix/withdraw-rounding-drift
docs/clarify-cliff-semantics
chore/bump-soroban-sdk
test/accrual-property-tests
```

Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`.

Commit messages use the same prefixes. Write them for someone reading `git log` in a year:

```
fix: settle final withdrawal to remaining balance, not the formula

Computing the last withdrawal from total * elapsed / duration strands
up to (duration - 1) stroops when the total doesn't divide evenly.
Special-case now >= end to pay out the full remainder.
```

## Pull requests

Open a draft PR early if you want feedback partway. Mark it ready when it is.

What we expect:

- **One concern per PR.** A refactor bundled with a bug fix is two PRs. If your diff touches an area the issue didn't mention, split it.
- **Tests for behavior changes.** Contract logic without tests won't be merged. This is custody code — a rounding bug is a lost-funds bug.
- **Docs updated in the same PR.** If you change how something works, the doc describing it changes in the same commit, not "later."
- **CI green.** `cargo fmt`, `cargo clippy -D warnings`, and the test suite all pass.
- **No new dependencies without discussion.** Every crate in a contract is trusted code with custody of user funds. Justify it in the PR description or raise it in the issue first.
- **Explain the tradeoff, not the diff.** We can read the diff. Tell us what you chose and what you gave up.

The PR template asks for these. It isn't ceremony — reviewers use it to decide what to look at.

## Review bar

Two things get a hard "no" regardless of how good the code is:

1. **It can lose or strand funds.** Rounding that doesn't conserve value, a path where an earned balance becomes unwithdrawable, an unbounded loop or collection that can push a withdrawal past the transaction resource limit. If your change touches accrual math or storage layout, expect close review and expect to be asked for property tests.
2. **It gives someone power they shouldn't have.** An admin who can pause withdrawals, an approver who can redirect funds, an upgrade path with no stated policy. Read [docs/architecture.md](docs/architecture.md#authorization).

Beyond that, review is about clarity. Contract code is read far more often than written, and it's read by auditors who are trying to break it. Prefer the obvious implementation over the clever one. If a function needs a comment to explain *what* it does, it probably needs a different shape; comments explaining *why* are always welcome.

Reviews aim for a first response within a few days. If a PR goes quiet longer than that, ping it — that's a maintainer failure, not rudeness on your part.

## Reporting security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Conduct

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies to everything in this repo and its issue tracker.

## Credit

Everyone whose PR is merged gets added to [CONTRIBUTORS.md](CONTRIBUTORS.md) by a maintainer. **Don't add yourself in your PR** — with several people working at once, everyone editing the same table produces the same merge conflict, and you end up rebasing a credits file instead of shipping.

If you contributed something that isn't a merged PR — a design argument that changed the architecture, a bug found in review — open an issue saying so. That counts, and it gets recorded.
