<!--
Thanks for the PR. Delete sections that genuinely don't apply — but don't delete
the funds-safety section on a contract change. That's the one reviewers read first.
-->

## What this changes

<!-- One or two sentences. What behavior is different after this merges? -->

Closes #

## Why

<!-- The reasoning, not the diff. We can read the diff. If you chose between two
approaches, say what you gave up. -->

## Type

- [ ] `feat` — new behavior
- [ ] `fix` — corrects a defect
- [ ] `docs` — documentation only
- [ ] `test` — tests only
- [ ] `refactor` — no behavior change
- [ ] `chore` — tooling, deps, CI

## Funds safety

<!-- Required for any change to contract code, accrual math, or storage layout.
Write "N/A — docs only" if that's true. -->

- [ ] Value is conserved: deposits still equal withdrawals + refunds + remaining balance
- [ ] No path added where an earned balance becomes unwithdrawable
- [ ] No unbounded loop or unbounded stored collection introduced
- [ ] Ledger entry reads/writes per call unchanged, or the change is stated below
- [ ] Rounding is unchanged, or the new behavior rounds down and is tested
- [ ] `require_auth` covers every new privileged entry point

**Effect on per-transaction resource usage:**

<!-- e.g. "withdraw() unchanged at 3 entries read"  /  "adds 1 read to approve_milestone" -->

## Testing

<!-- What you added, and what you actually ran. "CI passed" is not a test plan. -->

- [ ] Unit tests added or updated
- [ ] Tested against testnet
- [ ] Edge cases covered — boundaries (`start`, `end`), same-ledger repeat calls, zero-duration, totals that don't divide evenly

```
# paste relevant test output
```

## Docs

- [ ] No doc change needed
- [ ] Docs updated in this PR
- [ ] A TODO in the docs is resolved by this change (say which)

<!-- If you changed behavior described in README.md, docs/concepts.md, or
docs/architecture.md, the doc changes belong in this PR, not a follow-up. -->

## Dependencies

- [ ] No new dependencies
- [ ] New dependencies added — listed and justified below

<!-- Every crate in a contract is trusted code with custody of user funds.
Name it, say why, and say what it replaces. -->

## Checklist

- [ ] Branch is named `<type>/<short-description>`
- [ ] `cargo fmt --all` clean
- [ ] `cargo clippy --all-targets -- -D warnings` clean
- [ ] Test suite passes locally
- [ ] This PR does one thing
- [ ] No keys, secrets, or `.env` files in the diff
- [ ] I've read [CONTRIBUTING.md](https://github.com/StelFlow-labs/StelFlow/blob/main/docs/CONTRIBUTING.md) and agree to license this under Apache-2.0

## Open questions for the reviewer

<!-- Anything you're unsure about. Flagging it gets you a better review;
hiding it gets you a slower one. -->
