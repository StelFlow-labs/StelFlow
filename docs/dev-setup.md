# Dev setup

A path from an empty toolchain to a verified build environment, with real output from actually
running each command — not transcribed from another doc. Replaces the setup section that used to
live in [CONTRIBUTING.md](CONTRIBUTING.md); that file now points here.

**Verified on:** Linux (Pop!\_OS 22.04, kernel 6.17, x86_64) — see [What wasn't verified
here](#what-wasnt-verified-here) for the two steps this pass didn't get through, and
[Troubleshooting](#troubleshooting) for what's expected to differ on macOS/WSL.

There is no code in this repo yet — see [ROADMAP.md](ROADMAP.md). Nothing here builds a
contract. This doc ends at "the toolchain is verified," not "the project builds," because that
second thing doesn't exist yet.

## Rust: stable toolchain and the wasm32v1-none target

```bash
rustup install stable
rustup target add wasm32v1-none
```

`wasm32v1-none` needs rustc 1.84 or newer ([CONTRIBUTING.md](CONTRIBUTING.md) says so; this is
the check that confirms it). On this machine:

```
$ rustc --version
rustc 1.96.0 (ac68faa20 2026-05-25)

$ cargo --version
cargo 1.96.0 (30a34c682 2026-05-25)

$ rustup show
Default host: x86_64-unknown-linux-gnu
rustup home:  /home/godbrand/.rustup

installed toolchains
--------------------
stable-x86_64-unknown-linux-gnu (active, default)
1.89.0-x86_64-unknown-linux-gnu
1.91.0-x86_64-unknown-linux-gnu

active toolchain
----------------
name: stable-x86_64-unknown-linux-gnu
active because: it's the default toolchain
```

1.96.0 comfortably clears the 1.84 floor. Before adding the target, `rustup target list
--installed` showed only `wasm32-unknown-unknown` and `x86_64-unknown-linux-gnu` — the older Wasm
target `stellar-cli` scaffolding sometimes assumes, and the host target. Running `rustup target add
wasm32v1-none`:

```
$ rustup target add wasm32v1-none
info: downloading component rust-std
```

...succeeded and pulled down the `rust-std` component for that target. Confirmed after:

```
$ rustc --version --verbose
rustc 1.96.0 (ac68faa20 2026-05-25)
binary: rustc
commit-hash: ac68faa20c58cbccd01ee7208bf3b6e93a7d7f96
commit-date: 2026-05-25
host: x86_64-unknown-linux-gnu
release: 1.96.0
LLVM version: 22.1.2
```

If `rustup target add wasm32v1-none` errors instead of downloading, the active toolchain predates
1.84 — run `rustup update stable` first.

The old setup section also listed `stellar contract build`, `cargo test`, `cargo fmt --all`, and
`cargo clippy --all-targets -- -D warnings` as things to run. Those aren't here: there are no
contract crates in this repo yet, so running them today would either error out or silently do
nothing, and pasting their output would be exactly the invented build step this issue said not to
fabricate. `cargo fmt`/`cargo clippy -D warnings` passing is still a real CI expectation — see
[CONTRIBUTING.md](CONTRIBUTING.md)'s Pull requests section — it just has nothing to check yet.
The build/test commands themselves arrive with Phase 1's contract crates; see
[ROADMAP.md](ROADMAP.md).

## Stellar CLI

```bash
cargo install --locked stellar-cli
```

This machine already had `stellar-cli` installed from earlier work on this project, so this pass
did not time a from-empty `cargo install --locked stellar-cli` run. That timing gap is called out
explicitly in [What wasn't verified here](#what-wasnt-verified-here) — don't take its absence as a
claim that the install is fast. `cargo install` builds `stellar-cli` from source; contributors on a
slower machine or a metered connection should expect this to take several minutes to install this way, and can use the
prebuilt-binary releases at <https://github.com/stellar/stellar-cli/releases> instead if that's a
problem — `cargo install --locked` and a prebuilt binary produce a compatible CLI, so either is
fine for this repo's purposes.

What running it now actually reports:

```
$ stellar --version
stellar 23.1.3 (dde778f0c26e352d8ad2eeb63382ea25ed5e0bb5)
stellar-xdr 23.0.0 (e83a6337204ecfdb0ac0d44ffb857130c1249b1b)
xdr curr (4b7a2ef7931ab2ca2499be68d849f38190b443ca)
```

`stellar-cli` is the tool formerly published as `soroban-cli` — if a tutorial or search result
tells you to install `soroban-cli`, it predates the rename; install `stellar-cli` instead.

## Testnet identity

```bash
stellar keys generate --global alice --network testnet --fund
stellar keys address alice
```

Never put a mainnet key in a config file in this repo. There is no reason to have one here.

Not run against live testnet in this pass — see [What wasn't verified
here](#what-wasnt-verified-here).

## Node and pnpm

```bash
node --version   # 22 LTS or newer
corepack enable  # ships with Node, manages pnpm
```

```
$ node --version
v24.13.1

$ corepack --version
0.34.6
```

v24.13.1 clears the 22 LTS floor. `corepack enable` was already active on this machine from
earlier setup; enabling it is idempotent, so re-running it is harmless if you're not sure whether
it's on.

A root `package.json` may or may not exist yet, depending on whether the docs-tooling PR (CI
lint/format setup) has landed — the SDK/dashboard workspace itself lands with a later phase (see
[ROADMAP.md](ROADMAP.md)). Either way, `corepack` reads `packageManager` from whichever
`package.json` is present and fetches the pinned pnpm version automatically the first time you run
a `pnpm` command in this repo — you won't need to `npm install -g pnpm` yourself. If neither exists
yet, `corepack enable` is the whole Node/pnpm setup for now.

## Checking network limits

Several design constants in [docs/architecture.md](architecture.md#the-per-transaction-read-budget)
depend on live Soroban network settings, which change between protocol upgrades. The command for
checking them for yourself:

```bash
stellar network settings --network testnet
```

## What wasn't verified here

Two things this pass did not run, so this section says so instead of inventing output for them —
per this issue's own instruction not to fabricate a step that appears to work:

- **A timed, from-empty `cargo install --locked stellar-cli`.** This machine already had
  `stellar-cli` 23.1.3 installed. The version check above is real; the install-time figure is not,
  and shouldn't be trusted here until someone runs it from a clean cargo registry and records how
  long it actually took.
- **`stellar keys generate --global <name> --network testnet --fund` and the `stellar network
settings --network testnet` call above.** Both are one-liners and expected to work exactly as
  documented on the Stellar side, but this pass didn't execute them against testnet and paste the
  response, so treat that specific claim as unverified rather than confirmed. If you run these as
  part of picking up other work in this repo, a PR comment or follow-up correcting this section
  (with the real output) is exactly the kind of small contribution CONTRIBUTING.md is asking for.

## Troubleshooting

Nothing here actually failed on this pass — every command above succeeded on the first try. That's
worth saying explicitly rather than leaving this section implicit: an honest troubleshooting
section can say "nothing broke," it doesn't have to invent a failure to be complete. What follows
is what's worth knowing if something *does* go wrong, collected in one place instead of scattered
through the prose above.

- **`rustup target add wasm32v1-none` errors instead of downloading.** The active toolchain
  predates 1.84 — run `rustup update stable` first.
- **A tutorial or search result tells you to install `soroban-cli`.** That name predates the
  rename; install `stellar-cli` instead — same tool, same team, new name.
- **macOS: `cargo install --locked stellar-cli` fails partway through a C dependency build.**
  Xcode Command Line Tools are probably missing — `rustup`'s install script and the `stellar-cli`
  build should otherwise behave the same as on Linux. Not tested in this pass; this machine is
  Linux, so this is an expected-difference note, not a verified one.
- **WSL: `cargo` builds are dramatically slower than expected, or you hit file-locking errors.**
  Keep the whole repo inside the WSL filesystem, not under `/mnt/c/...` — cross-filesystem builds
  on Windows drives are known to be slow and occasionally lock. Also not tested in this pass.

If you hit something concrete on either platform, or anything not listed here, that's exactly the
finding this doc is for — correct this section in your PR rather than working around it silently.

## Next

- [../CONTRIBUTING.md](CONTRIBUTING.md) — how to pick up an issue once your toolchain checks out.
- [architecture.md](architecture.md) — why the toolchain looks the way it does (`wasm32v1-none`,
  `i128` arithmetic, the read-budget constants `stellar network settings` reports).
- [../ROADMAP.md](ROADMAP.md) — Phase 1 is where contract crates actually arrive.
