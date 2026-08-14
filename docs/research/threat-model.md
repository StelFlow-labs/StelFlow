# Research: threat model for milestone-gated streaming

Answers [issue #9](https://github.com/StelFlow-labs/StelFlow/issues/9).

[SECURITY.md](../../SECURITY.md) names five classes of concern in a short section. This document is
the reasoning behind them, written before Phase 1 so the contract can be built against it rather
than audited against it later.

**Nothing here describes a vulnerability in deployed software.** There is no deployed software. Every
threat below is a property of the design as it currently stands in
[architecture.md](../architecture.md) and [concepts.md](../concepts.md), and several of them are
resolved by decisions that haven't been made yet. Where that's the case, this document says which
decision and recommends an answer.

## How threats are rated

**Severity** is the worst plausible outcome for a user, not for the project:

| | Meaning |
|---|---|
| Critical | Funds lost, or earned funds permanently unwithdrawable |
| High | Funds locked with no recovery path, or a large trust concentration |
| Medium | Bounded loss, recoverable loss, or loss confined to a counterparty the user chose |
| Low | Degraded experience, cost imposed, no value at risk |

**Likelihood** assumes a rational attacker paying real fees on a live network, and — importantly for
this system — an attacker who often has to be a party to the stream already. Most of what follows is
not "an anonymous adversary on the internet"; it's a sender or an approver behaving badly, which is a
different and more tractable problem.

**Priority** is severity weighted by likelihood, and is what Phase 1 should build against.

## Ranking

| # | Threat | Severity | Likelihood | Priority | Status |
|---|---|---|---|---|---|
| [T1](#t1--upgrade-authority-is-the-largest-trust-concentration-in-the-system) | Upgrade authority replaces the accrual logic | Critical | Decision-dependent | **P0** | Open decision |
| [T2](#t2--resource-exhaustion-as-denial-of-withdrawal) | Resource exhaustion makes a stream unwithdrawable | Critical | Medium | **P0** | Mitigated by design, caps unset |
| [T3](#t3--an-approver-who-never-comes-back) | Approver disappears; tranche locked forever | High | Medium | **P1** | Unmitigated |
| [T4](#t4--non-standard-tokens-produce-under-funded-streams) | Fee-on-transfer token under-funds a stream | High | Low–Medium | **P1** | Undecided |
| [T5](#t5--an-emergency-stop-that-can-freeze-withdrawals) | Pause blocks withdrawal of earned funds | High | Decision-dependent | **P1** | Open decision |
| [T6](#t6--the-sender-controls-the-approver) | Sender names themselves approver, never approves, cancels | Medium | Medium | **P2** | Accepted + disclosure |
| [T7](#t7--issuer-clawback) | Issuer claws back funds from a live stream | Critical | Low, asset-dependent | **P2** | Accepted, out of scope |
| [T8](#t8--archival-economics-as-a-griefing-vector) | Restore cost made large relative to stream value | Medium | Low | **P3** | Partially mitigated |
| [T9](#t9--a-compromised-approver) | Approver key stolen, tranches released early | Medium | Low | **P3** | Bounded by design |
| [T10](#t10--dust-stream-griefing) | Many tiny streams sent to a victim | Low | Medium | **P3** | Accepted + off-chain fix |
| [T11](#t11--ledger-timestamp-influence) | Validator influences close time to shift accrual | Low | Very low | **P4** | Accepted |
| [T12](#t12--rounding-and-dust-extraction) | Repeated withdrawals extract more than the formula allows | — | — | — | **Not a threat** — see proof |

Three of the top five are open design questions rather than attacks. That is the honest state of the
design, and it's the useful output of doing this before Phase 1 rather than after.

---

## T1 — Upgrade authority is the largest trust concentration in the system

**Attacker:** whoever holds the upgrade key — a compromised maintainer, a coerced one, or an insider.

**Capability:** Soroban contracts can replace their own Wasm. An upgrade can rewrite `withdraw` to
send funds anywhere.

**Impact:** total loss of every stream held by the contract, simultaneously. Nothing else in this
model comes close.

**Cost:** one transaction, if the key exists.

**Mitigation.** This is [open question 4](../architecture.md#open-questions) and it is not yet
decided. The threat model's answer: **a custody contract should not be unilaterally upgradeable.**
Either ship non-upgradeable with a documented migration path — users move to a new contract by
cancelling and re-creating, which is transparent and opt-in — or, if upgradeability is kept, put it
behind a multisig *and* a timelock long enough that a recipient watching the chain can withdraw
before an upgrade lands. An instant unilateral upgrade key makes every other mitigation in this
document decorative.

**Status:** open decision, recommended answer above.

## T2 — Resource exhaustion as denial of withdrawal

**Attacker:** usually no one. This is mostly a self-inflicted wound, which is why it ranks so high —
it needs no adversary at all.

**Capability:** [milestones live inside the stream struct](../architecture.md#the-per-transaction-read-budget)
rather than as separate entries. A stream with enough milestones produces an entry large enough that
reading it exceeds the transaction's resource budget.

**Impact:** the recipient's earned funds can never be withdrawn. This is
[SECURITY.md](../../SECURITY.md)'s class 2 and the worst outcome the system can produce short of
outright theft — worse in one respect than theft, because there is no attacker to pursue and no
recovery path at all.

**Cost:** nothing. A sender can do it by accident.

**Mitigation.** Already in the design: a hard `MAX_MILESTONES_PER_STREAM` enforced at creation, and
bounded vectors on any batch entry point. Two things this model adds:

- **The cap must be derived from measurement, not chosen.** It's an open TODO in architecture.md,
  and until it has a number, this threat is unmitigated in practice rather than in principle.
- **A stream's withdrawal cost must not grow with its own history.** The cap bounds milestones, but
  the same failure returns if anything else unbounded is ever stored inside the entry — a withdrawal
  log, a per-approver audit trail, a list of past cancellations. The invariant Phase 1 should hold
  is that `withdraw` reads a fixed number of entries and deserializes a structure whose size is
  bounded at creation and never grows afterwards. Worth stating as a rule now, because the pressure
  to add "just one more field" arrives later.

One reassurance that falls out of the per-stream-entry layout: network limits have historically been
raised rather than lowered, but even if they were lowered, only streams built near the old ceiling
would be affected — a conservative cap buys margin against that too.

**Status:** mitigated by design; blocked on measurement.

## T3 — An approver who never comes back

**Attacker:** none required. The approver is a company that folded, a person who lost their key, a
contract that was superseded, or someone who simply stopped answering.

**Capability:** [milestone gates](../concepts.md#milestone-gates) release only when the named
[approver](../glossary.md#approver) marks them met. There is no timeout and no fallback.

**Impact:** the gated tranche accrues normally and is never claimable. On a **cancelable** stream the
sender can cancel and recover it — the recipient loses work they may have done, but the funds aren't
destroyed. On a **non-cancelable** stream there is currently **no recovery path for anyone**. The
tranche accrues to a balance nobody can ever move. Non-cancelable is the recommended default for
vesting, so this lands on exactly the streams where the recipient's guarantee matters most.

**Cost:** zero, and it doesn't require malice — indefinite silence is the whole attack.

**Mitigation.** None today. Options, roughly in order of how much I'd argue for them:

1. **A per-milestone deadline set at creation**, after which the tranche resolves to a default
   declared up front — to the recipient, or to the sender, chosen by whoever creates the stream and
   visible to both before anyone signs. This keeps the contract's "no global admin" property intact
   because the resolution is a term of the stream, not a privilege someone exercises.
2. **A fallback approver, or k-of-n approvers.** Removes the single point of failure but adds
   milestone-struct size, which pushes directly against T2's cap.
3. **Do nothing, and disclose it.** Defensible only if the SDK makes the risk unmissable at creation.

Option 1 is a real design change and I'd rather it be argued about now than discovered in an audit.
It also interacts with [issue #17](https://github.com/StelFlow-labs/StelFlow/issues/17)
(revocation) — a deadline and a revocation are the same mechanism pointed in opposite directions,
and deciding them together will produce a better answer than deciding them apart.

**Status:** unmitigated. Recommend deciding before Phase 2 ships milestones.

## T4 — Non-standard tokens produce under-funded streams

**Attacker:** a token issuer, or a sender who knowingly picks such an asset.

**Capability:** a fee-on-transfer or rebasing token delivers less to the contract than the sender
asked to send. The contract stores `total` as the requested figure.

**Impact:** the stream promises more than it holds. Accrual is computed against a `total` the
contract can't pay, so early withdrawers are paid in full and the last withdrawer — usually the
recipient's final settlement — finds the balance short. That is a **value-conservation failure**,
[SECURITY.md](../../SECURITY.md)'s class 1, and it breaks the invariant every scenario in
[behaviour.md](../specs/behaviour.md) asserts.

**Cost:** free to the issuer; invisible to the sender at creation.

**Mitigation.** This is architecture.md's open TODO and
[behaviour.md's `UNDECIDED` #4](../specs/behaviour.md#undecided-cases). The threat model's answer:
**measure, don't trust.** `create_stream` should read the contract's own balance before and after the
transfer and store the delta as `total`. It costs one extra balance read at creation, it makes the
stored figure true by construction for every asset, and it converts an unbounded class of
asset-specific bugs into a non-issue. Documenting such assets as "unsupported" is the weaker option:
nothing enforces it, and the failure surfaces months later at the final withdrawal.

**Status:** undecided. Recommend balance-delta accounting.

## T5 — An emergency stop that can freeze withdrawals

**Attacker:** whoever holds the pause key, under compulsion or otherwise.

**Capability:** [open question 5](../architecture.md#open-questions) asks whether there's an
emergency stop and whether it can stop withdrawals.

**Impact:** if a pause can block `withdraw`, then a recipient's *already-earned* balance is freezable
by a third party. That is the same outcome as T3 with an owner attached, and it is indistinguishable
from a rug from the recipient's side.

**Mitigation.** The question in architecture.md already contains the answer, and this model states it
plainly: **a pause must never be able to block `withdraw`.** Pausing `create_stream` is defensible —
it stops new exposure during an incident and takes nothing from anyone. Pausing withdrawal converts a
custody contract into a discretionary one. If the only way to make an incident survivable is to
freeze earned funds, the design is wrong somewhere else.

**Status:** open decision, recommended answer above.

## T6 — The sender controls the approver

**Attacker:** the sender, or a party colluding with them.

**Capability:** nothing prevents a sender from naming themselves — or an address they control — as a
milestone's approver. [Cancellation rule 4](../concepts.md#cancellation-and-clawback) then returns
unapproved tranches to the sender **in full**, including the portion that already accrued while the
gate was shut.

**Impact:** the recipient does the work, the sender never approves, the sender cancels, and the
entire gated tranche returns to the sender. The recipient keeps only the base tranche. Note what
makes this sting: from the recipient's side the stream *looked* funded the whole time — the milestone
amount was visibly escrowed and visibly accruing.

**Cost:** the sender pays fees and gives up the base tranche. If the gated portion is the majority of
the stream, the trade is clearly in their favour.

**Mitigation.** This is not a contract bug — rule 4 is a deliberate choice and the right one for the
grant case it was designed for, and StelFlow's model is that you choose your counterparty. But
"working as designed" and "adequately disclosed" are different claims, and only the first is
currently true. Recommended, all off-chain:

- The SDK and dashboard **must** display the approver's address at creation and before signing, and
  warn plainly when `approver == sender`.
- The same surfaces should show what fraction of the total sits behind gates. "40% of this stream is
  released only if the sender approves it" is the sentence a recipient needs before signing.
- Docs should say directly that a milestone whose approver is the sender is an unsecured promise, not
  an escrow guarantee.

A contract-level ban on `approver == sender` is tempting and I'd argue against it: it's trivially
evaded with a second address, so it would buy the appearance of protection while making honest
single-party setups awkward. Disclosure is the honest mitigation here.

**Status:** accepted, contingent on the disclosure work above actually being built.

## T7 — Issuer clawback

**Attacker:** the asset issuer.

**Capability:** if an asset was issued with `AUTH_CLAWBACK_ENABLED`, the issuer can burn it from any
holder — including this contract, mid-stream. The power belongs to the
[SAC's](../glossary.md#stellar-asset-contract-sac) admin interface, not to anything
[SEP-41](../glossary.md#sep-41) defines, so it rides on the asset rather than the interface.

**Impact:** funds vanish from a live stream. Total loss, and no contract logic can prevent or detect
it in advance.

**Cost:** one transaction by the issuer.

**Mitigation.** None possible, by construction. What's available is disclosure, and the design
already gets the important part right: `balance` is the truth, and the contract must not treat its
stored `total` as a guarantee.

The question the issue raises — should creation *refuse* on clawback-enabled assets? — deserves a
direct answer: **no, warn loudly instead.** Regulated stablecoins commonly enable clawback for
compliance reasons, and refusing them would rule out a large share of the real payroll and grant use
cases StelFlow exists for. Refusal also can't be complete: an issuer can enable the flag after a
stream is created. So the flag should be checked and surfaced at creation, re-checked and displayed
on the dashboard for live streams, and never presented as a solved problem.

**Status:** accepted and out of scope, per [SECURITY.md](../../SECURITY.md#scope). Ranked P2 rather
than lower only because the severity is total and the disclosure work is real.

## T8 — Archival economics as a griefing vector

**Attacker:** the sender, or the passage of time.

**Capability:** [restoration cost scales with entry size](ttl-strategy.md#what-extending-and-restoring-costs)
and with network congestion, through a rent curve that grows with a **1,000× factor** once network
state exceeds its target size. A sender who creates a stream with the maximum permitted milestones
makes its entry large, and therefore its restoration expensive. Pair that with a long cliff — during
which nothing touches the entry — and the stream reliably archives before the recipient can act.

**Impact:** the recipient must pay a restore fee out of proportion to the balance they're claiming.
For a small stream, the rational move is to abandon it. Funds aren't lost — archival preserves the
entry — but they're economically stranded, which for the recipient is a distinction without much
difference.

**Cost:** essentially free to the sender; it's a side effect of choices they'd make anyway.

**Mitigation.** Mostly already present, and worth stating so the interaction is visible:

- `MAX_MILESTONES_PER_STREAM` (T2) bounds entry size, and therefore bounds restore cost. The cap is
  now doing double duty and should be chosen with both jobs in mind.
- **TTL extension has no auth check** — anyone can extend any entry — so a sender cannot prevent a
  recipient, a watcher, or a disinterested third party from keeping a stream alive.
- Restoration is a single one-time payment made at the moment the stream is used again.
- The SDK should show the estimated restore cost alongside the claimable balance, so "is this worth
  claiming" is a question the recipient can answer before signing rather than after.

The larger risk here isn't an attacker at all: it's the rent curve moving under everyone at once. That
is environmental, affects all Soroban contracts equally, and is not something StelFlow can mitigate —
only surface.

**Status:** partially mitigated; the residual is accepted.

## T9 — A compromised approver

**Attacker:** whoever steals an approver's key, or bribes them.

**Capability:** mark milestones met.

**Impact:** smaller than it first appears, and the design deserves credit for it. Approval
[does not accelerate accrual](../concepts.md#what-a-gate-does-not-do) — it unlocks what has already
streamed. So a compromised approver releases at most the tranche's *accrued-to-date* amount, not the
tranche's full value, and the released funds go to the **recipient**, not to the attacker. Unless the
attacker *is* the recipient, compromising an approver spends a stolen key to pay a third party early.
The sender's loss is bounded by tranches that have accrued, and there is no path to redirection.

**Cost:** obtaining the key.

**Mitigation.** Approvers should be contract addresses where the stakes justify it — architecture.md
already supports this, and it's how a Trustless Work escrow acts as approver, replacing a single key
with a process. Beyond that, the bounded impact is the mitigation.

Note the asymmetry with T3: a *compromised* approver is a Medium, a *missing* approver is a High.
Availability is the harder property here, not integrity.

**Status:** bounded by design. No change recommended.

## T10 — Dust-stream griefing

**Attacker:** anyone with fees to burn.

**Capability:** create many tiny streams naming a victim as recipient.

**Impact:** the victim's dashboard and any "withdraw everything" flow fill with junk. Critically, it
**cannot** make the victim's real streams unwithdrawable: state is one entry per stream, so a
withdrawal on a real stream touches only that stream's entry regardless of how many dust streams
exist. The batch path is where it bites, and that path is already required to take a bounded vector
and let the SDK chunk (T2), so the ceiling is UI noise rather than denial of withdrawal.

**Cost:** real, and unusually unfavourable to the attacker — every dust stream requires actually
transferring the streamed amount plus fees plus rent. The victim can ignore them for free. The
attacker is paying to be annoying, with no leverage.

**Mitigation.** No contract change. Specifically **not** a minimum stream amount: it would block
legitimate small streams, needs a denomination-aware threshold across every supported asset, and a
determined griefer just funds slightly above it. The right place is off-chain — the indexer and
dashboard should rank and filter by value, sender reputation, or an explicit allowlist, and batch
operations should default to streams above a user-chosen threshold.

**Status:** accepted; mitigated in the dashboard and indexer, not the contract.

## T11 — Ledger timestamp influence

**Attacker:** a validator, or someone who has bribed enough of them.

**Capability:** nudge the [ledger close time](../glossary.md#ledger-close-time) that
`env.ledger().timestamp()` returns.

**Impact:** worth showing the arithmetic, because the intuition that "time controls money here" makes
this feel more dangerous than it is. Accrual is `total × elapsed / duration`, so shifting `now`
forward by Δ changes what's streamed by `total × Δ / duration`. On the 30-day, 3,000 USDC stream in
[concepts.md](../concepts.md#a-worked-example-alice-and-bob), a Δ of one ledger — about 5 seconds —
moves roughly **0.006 USDC**. Moving 1% of the stream's value requires Δ ≈ 7.2 hours, which SCP will
not produce; close times are consensus values, non-decreasing and closely tracked to real time.

And moving time forward mostly just pays the recipient sooner — money that was already destined for
them. There is exactly one case where it transfers value rather than accelerating it: a recipient who
pushes `now` past `end` immediately before a sender's `cancel` lands captures the unstreamed
remainder that cancellation would have returned. That's the version worth naming, and it still
requires moving consensus time by a meaningful fraction of the stream's duration to be worth
anything.

**Cost:** absurd relative to the gain in any realistic case.

**Mitigation.** Already present and sufficient: clamping `now` to `[start, end]` bounds the effect,
and the end-of-stream case pays the remaining balance rather than an extrapolation, so time cannot
push accrual past `total`.

**Status:** accepted.

## T12 — Rounding and dust extraction

**Claim to test:** can repeated withdrawals at chosen moments extract more than the formula allows,
or strand value permanently?

**No, and it's worth writing down why, because "salami slicing" is a real bug class elsewhere.**

The property that kills it is that `streamed` is
[recomputed from scratch on every call](../architecture.md#arithmetic) rather than accumulated, and a
withdrawal pays `streamed(t) − withdrawn`. Withdrawing at times `t₁ < t₂ < … < tₙ` pays

```
(streamed(t₁) − 0) + (streamed(t₂) − streamed(t₁)) + … + (streamed(tₙ) − streamed(tₙ₋₁))
  = streamed(tₙ)
```

The sum telescopes. The total paid depends only on the *last* withdrawal time, never on how many
withdrawals happened or when. There is no increment for truncation to be applied to, so there is
nothing to accumulate an advantage from — a thousand withdrawals pay exactly what one withdrawal at
the same final moment pays. Flooring is applied to `streamed(t)` itself, which is bounded above by
`total`, so no schedule of withdrawals can exceed the deposit.

Stranding is bounded too. Mid-stream, truncation leaves `streamed` at most a stroop or so per portion
below the real-valued figure, and that shortfall is recovered as accrual moves past it rather than
compounding. At `end` the special case pays the remaining balance rather than recomputing, so the
final settlement is exact — which is what
[concepts.md's reconciliation](../concepts.md#reconciliation) demonstrates and what every
state-changing scenario in [behaviour.md](../specs/behaviour.md) asserts.

One caveat, more precision than defect: `streamed` is floored **per portion** and then summed, so a
multi-tranche stream can sit a few stroops below a single-tranche stream of the same total. It errs
toward the contract holding slightly more, never less, and the end-of-stream case clears it. Phase 1's
tests should assert the direction of that error explicitly rather than assume it.

**Status:** not a threat. Listed because "we checked and it's fine, here's the proof" is more useful
to an auditor than silence.

---

## Accepted risks

Stated plainly, because a threat model where everything is mitigated is a threat model that isn't
finished:

1. **Issuer clawback (T7).** Unfixable by any contract. Accepted permanently, mitigated only by
   disclosure. If you stream a clawback-enabled asset, the issuer is a trusted party whether you
   like it or not.
2. **Sender-controlled approvers (T6).** Accepted as a consequence of the counterparty model.
   Mitigated by disclosure in the SDK and dashboard — which means the acceptance is only honest once
   that disclosure exists.
3. **Dust-stream griefing (T10).** Accepted at the contract level. The attacker pays; the victim
   ignores.
4. **Residual archival cost (T8).** Accepted. Rent is a network property, and the recipient's
   exposure is a bounded one-time fee.
5. **Timestamp influence (T11).** Accepted. The arithmetic makes it uneconomic.

## Design changes this model asks for

Collected so they can be argued with individually:

1. **Set `MAX_MILESTONES_PER_STREAM` from measurement** before Phase 2 (T2, T8).
2. **Hold the rule that `withdraw`'s cost never grows with a stream's history** (T2).
3. **Decide milestone deadlines or fallback approvers** alongside
   [issue #17](https://github.com/StelFlow-labs/StelFlow/issues/17) (T3).
4. **`create_stream` should store the measured balance delta, not the requested total** (T4).
5. **If a pause exists, it must not be able to block `withdraw`** (T5).
6. **Non-upgradeable, or upgradeable behind multisig plus a timelock** (T1).
7. **SDK and dashboard must surface approver identity, gated fraction, clawback flag, and estimated
   restore cost** (T6, T7, T8).

## What this model doesn't cover

- **The SDK, indexer, and dashboard as attack surfaces in their own right.** A malicious or buggy
  frontend that gets a user to sign the wrong transaction is in
  [SECURITY.md's scope](../../SECURITY.md#scope) but needs its own model once there's code.
- **Trustless Work's contracts**, when an escrow acts as approver. Their trust assumptions become
  ours at that boundary, and that deserves examination when the integration is real rather than
  intended.
- **Key management and phishing.** Out of scope and better covered by wallet ecosystems.
- **Anything requiring code to exist.** No implementation bugs are modelled here, because there is no
  implementation. This document's job is to make sure the code that gets written has fewer places to
  put them.

## Next

- [ttl-strategy.md](ttl-strategy.md) — archival and restore economics, which T8 leans on directly.
- [../specs/behaviour.md](../specs/behaviour.md) — the value-conservation invariant T4 and T12 are
  about, asserted scenario by scenario.
- [../../SECURITY.md](../../SECURITY.md) — reporting process and scope.
- [../architecture.md](../architecture.md#open-questions) — open questions 4 and 5 are T1 and T5.
