# Contributors

People who have shaped StelFlow. Credited by GitHub handle.

This list is not only for merged PRs. A design argument that changed the architecture, a bug caught in review, a correction to a wrong claim about Soroban — those count, and they matter more than usual on a project whose only artifact right now is its design.

## Maintainers

| Handle | Role |
|---|---|
| [@jayteemoney](https://github.com/jayteemoney) | Author, maintainer. Previously built [StackStream](https://github.com/jayteemoney/stackstream) on Stacks. |

StelFlow has one maintainer today. That's a bus factor of one, and worth stating plainly rather than leaving a reader to work out. Growing this table is an explicit goal — contributors who stay past a couple of merged PRs get asked.

## Contributors

<!--
Maintainers add rows here when a PR merges. Contributors: don't edit this file
in your PR — see "How you get added" below. Alphabetical by handle. Format:

| [@handle](https://github.com/handle) | What you contributed | #PR or #issue |
-->

| Handle | Contribution | Ref |
|---|---|---|
| [@d-plug](https://github.com/d-plug) | The worked Alice-and-Bob example in [concepts.md](docs/concepts.md) — StelFlow's first merged PR. Also caught that the doc's account of end-of-stream exactness didn't match architecture.md. | [#16](https://github.com/StelFlow-labs/StelFlow/pull/16) |

## Design review and prior art

Credit for input that isn't code.

<!-- TODO(maintainer): as design feedback comes in, list the people who gave it. Also credit the Trustless Work team here if and when they review the integration design — don't credit them before they actually have. -->

- **[Sablier](https://github.com/sablier-labs)** — the reference implementation of token streaming on EVM. StelFlow's accrual model is the same core idea. No code is shared; the chains are too different for that to be meaningful.
- **[Trustless Work](https://github.com/Trustless-Work)** — escrow infrastructure on Soroban. StelFlow is designed to integrate with it rather than reimplement escrow, milestones, and disputes. <!-- TODO(maintainer): this describes an intended integration, not an existing partnership. Don't upgrade the wording until there's been an actual conversation. -->
- **[StackStream](https://github.com/jayteemoney/stackstream)** — the maintainer's earlier payment-streaming protocol on Stacks. Different codebase, same problem. Its [security review](https://github.com/jayteemoney/stackstream/tree/main/audits) was run as an open multi-auditor process, and the model StelFlow uses for contribution and review comes from what worked there. <!-- TODO(maintainer): the StackStream audit credits 11 named reviewers. Anyone whose finding shaped StelFlow's design — particularly the griefing and recovery-path bugs — is worth naming here by handle. -->

## Security researchers

Anyone who reports a valid vulnerability is credited here and in the advisory, unless they'd rather not be. See [SECURITY.md](SECURITY.md).

_None yet — there's no deployed code to find bugs in._

## How you get added

**Don't edit this file in your PR.** With several contributors working at once, everyone appending a row to the same table means everyone hits the same merge conflict, and the last three PRs to land spend their time rebasing a credits file instead of shipping.

A maintainer adds you when your PR merges. If you'd rather it happen automatically, that's what the `@all-contributors` bot is for — anyone can comment `@all-contributors please add @you for doc,code` on a merged PR and the bot opens its own PR to update this file.

<!-- TODO(maintainer): install the all-contributors GitHub App if you want this automated. It removes a step from every PR and a conflict class from every busy week. Skip it if you'd rather curate by hand — at five contributors, by hand is still fine. -->

If you contributed something that never became a PR — a design argument that changed the architecture, a bug caught in review — open an issue saying so and it gets added. That's not cheeky, it's the intended path.
