# Design decision: upgradeability and emergency pause

Answers [issue #33](https://github.com/StelFlow-labs/StelFlow/issues/33), which is
[architecture.md](architecture.md#open-questions) open questions 4 and 5 and
[threat-model](threat-model.md) **T1** and **T5**.

**Three decisions, which are really one:**

1. **StelFlow Core ships non-upgradeable.** No upgrade function, therefore no upgrade key, therefore
   no upgrade authority to compromise or coerce. T1 is closed by removing the capability rather than
   guarding it.
2. **The only pausable entry point is `create_stream`.** `withdraw`, `cancel`, `approve_milestone`,
   and TTL extension are never pausable. The pause auto-expires and can be renounced permanently.
3. **`cancel` on a non-cancelable stream is permitted when the sender *and* the recipient both
   authorize it.** This is not a new entry point and not a new settlement rule — it is one
   authorization rule, and it is what makes decision 1 survivable.

Decision 3 exists because of decision 1, and decision 2 exists to serve decision 1. Deciding
upgradeability without deciding the other two would have produced an answer that doesn't work.

## The question everything else hangs off

A Soroban contract replaces its own Wasm through
[`env.deployer().update_current_contract_wasm(hash)`](https://developers.stellar.org/docs/build/guides/conventions/upgrading-contracts).
The important property, and the one that makes this decision clean, is that **only the contract
itself can call it.** There is no host-level operation, no ledger admin, and no issuer power that
swaps a deployed contract's code. Whatever authorization that function requires is whatever the
contract's own source says it requires.

So "non-upgradeable" is not a policy that has to be enforced. It is the *absence of a function*. A
contract that never writes `upgrade` is permanently immutable from the moment it is deployed, and
nothing anyone signs later can change that.

That cuts both ways, and the counter-argument in the issue is the real one: a bug in an immutable
contract cannot be fixed. The rest of this document is about whether that cost is payable. It is —
but only because of decision 3, and it took working the arithmetic to see why.

## Why the standard answer doesn't transfer

The received wisdom for custody contracts is *upgradeable, but behind a multisig and a timelock long
enough that users can exit before a malicious upgrade lands*. The threat model's own T1 offers it as
an acceptable alternative. It is wrong here, and the reason is specific to streaming.

A timelock protects users **because they can withdraw during it.** For a vault, that works: a
depositor's whole balance is withdrawable at any moment, so a timelock long enough to notice is a
timelock long enough to save everything.

A stream is the opposite. The entire product is that funds are *not* withdrawable yet. During a
timelock a recipient can rescue only what has streamed — and what has streamed is exactly the portion
they could already have taken at any time. **The timelock protects the funds that need protecting
least, and leaves the unstreamed remainder — the thing the recipient is actually relying on the
contract for — fully exposed.**

Here is that as numbers. A four-year vesting stream of 100,000,000,000 stroops, no cliff, and a
malicious upgrade announced at day *A* landing after a timelock of *T* days. The recipient watches
the chain, reacts immediately, and withdraws everything available at the last possible moment —
`(A + T) / 1461` of the grant, since accrual continues during the timelock:

| Timelock | Announced day 0 | Announced day 365 | Announced day 730 |
|---|---:|---:|---:|
| 7 days | rescues **0.5%** | 25.5% | 50.4% |
| 30 days | rescues **2.1%** | 27.0% | 52.0% |
| 90 days | rescues **6.2%** | 31.1% | 56.1% |
| 365 days | rescues 25.0% | 37.3% | 74.9% |

A 30-day timelock — already far longer than the 48-hour timelocks that are conventional in DeFi
governance — hands a perfectly attentive recipient **2.1%** of their grant if the attacker moves
early. The attacker chooses when to announce, so the attacker chooses the row.

Read the table the other way and the conclusion sharpens: to protect a recipient in full, the
timelock has to be at least as long as the stream. A timelock longer than the longest stream the
contract will ever hold is **behaviourally identical to being non-upgradeable**, except that it still
carries a key someone can be coerced into using, and still carries the code path that key operates.
That is strictly worse than not having the function.

Two smaller points that the table doesn't show, both of which push the same way:

- **Gated tranches can't be rescued at all.** Anything sitting behind an unmet milestone is `held`,
  not claimable, so a recipient racing a timelock cannot withdraw it however attentive they are. The
  more of a stream is milestone-gated — the feature StelFlow exists for — the less the timelock is
  worth.
- **A cliff makes it zero.** A recipient inside a cliff has `claimable = 0` by construction
  ([architecture.md](architecture.md#stream-lifecycle)). For the four-year-vest-with-one-year-cliff
  shape that vesting actually uses, an upgrade announced in month two lets the recipient rescue
  nothing whatsoever.

## The counter-argument, taken seriously

> A non-upgradeable contract with a discovered bug cannot be fixed, and "cancel and re-create" is not
> available to the holder of a non-cancelable stream — precisely the streams whose recipients were
> promised the strongest guarantee.

This is correct, and it is the only argument for upgradeability that survives the section above. It
has two halves and they need separating.

**The first half is not actually about upgradeability.** "We found a bug and can't fix it" is bad, but
an upgrade key does not make it good — it makes it *someone's decision*, and that someone is the
trust concentration T1 is about. The comparison isn't "broken contract vs. fixed contract," it is
"broken contract that everyone can see and leave, vs. contract that one key can rewrite, which
sometimes fixes a bug and sometimes doesn't." The first is auditable at signing time. The second
isn't, and a recipient has to price in the second forever, not only on the day a bug appears.

**The second half is the real problem, and it was a genuine gap in the design.** Migration means: stop
new deposits, tell everyone, let each stream unwind, re-create on the new contract. Trace who can
actually unwind:

| Stream | Can it leave? |
|---|---|
| `cancelable = true` | Yes. The sender cancels; rules 1–4 settle it; both parties re-create. |
| `cancelable = false` | **No. Nobody can move the funds, by design.** |

The second row is the whole issue. And note that it is not a migration problem specifically — it is
the same shape as [T3](threat-model.md#t3--an-approver-who-never-comes-back), where a non-cancelable
stream whose approver vanished has no recovery path for anyone. Two different causes producing one
identical dead end suggests the dead end is the defect, not the causes.

### The fix: cancel by unanimous consent

`cancelable = false` currently means *nobody can cancel*. It should mean *the sender cannot cancel
unilaterally*. Those are different, and the second is what the flag was ever supposed to buy.

The authorization rule on `cancel` becomes:

```
cancelable == true   ->  sender.require_auth()
cancelable == false  ->  sender.require_auth() AND recipient.require_auth()
```

That is the entire change. Specifically, it is **not**:

- a new entry point — `cancel` stays one function and the contract stays at four;
- a new settlement rule — [cancellation rules 1–4](concepts.md#cancellation-and-clawback) apply
  unchanged, so there is no new arithmetic and no new conservation case;
- a new role — both addresses are already stored on the stream;
- a weakening of anything. The recipient's guarantee under `cancelable = false` was "the sender can
  never stop this stream." It still is. They have gained an option and lost nothing, because the
  option requires their own signature.

Soroban supports this directly: a transaction carries a `SorobanAuthorizationEntry` per authorizing
address, and a contract may call `require_auth` on more than one address in a single invocation.

**The coercion objection, answered honestly.** A sender with leverage — an employer, a grantor — can
pressure a recipient into signing a mutual cancel. True. But that same sender can already pressure
the recipient into withdrawing and wiring the money back, which is available today, needs no protocol
feature, and is not detectable on-chain. Mutual cancel adds no coercive capability that leverage
didn't already confer. What it adds is a path that is *visible* — a cancel event the indexer records,
rather than an off-chain transfer nobody sees.

**What it does not do, stated plainly.** Mutual cancel makes stranded funds *movable*. It does not
decide who deserves them. In the T3 case — approver vanished, recipient did the work — rule 4 returns
the unapproved tranche to the sender in full, so a recipient who signs is signing away a tranche they
may have earned. They will often be right to refuse, and then the funds stay stranded. The parties
can settle the difference off-chain and frequently will, but the contract does not adjudicate it and
should not pretend to. T3 moves from **Unmitigated** to **Partially mitigated**: there is now a
recovery path where there was none, and it requires agreement.

## Pausing, scoped by entry point

The issue asked for a decision "scoped by entry point rather than contract-wide." Here it is:

| Entry point | Pausable | Why |
|---|---|---|
| `create_stream` | **Yes** | Stops new exposure during an incident. Takes nothing from anyone — a caller who is refused simply doesn't create a stream today. Nobody's funds are inside the contract yet. |
| `withdraw` | **Never** | Freezes a recipient's already-earned balance. Indistinguishable from a rug from where they are standing. |
| `cancel` | **Never** | Settlement, not entry. Blocking it strands the sender's refund *and* the recipient's earned balance behind a third party's key. |
| `approve_milestone` | **Never** | Moves no funds itself, but it is the recipient's only route to a gated tranche. Pausing it blocks earned funds by one extra step, and since approval only ever moves value toward the recipient there is nothing to contain by stopping it. |
| `bump_stream` / TTL extension | **Never** | Pausing it would let entries archive — harm, not safety. It would also be theatre: `ExtendFootprintTTLOp` has no auth check, so anyone can extend any entry regardless of what the contract thinks. |

One pausable entry point. A pause can therefore never touch a stream that already exists, which is
the property to hold onto: **the pause key has no power over anyone's money, only over whether new
money enters.**

### The strongest case for pausing `withdraw`, and why it still loses

The issue asked for an incident class that is only survivable by freezing withdrawals. There is one
worth taking seriously, and it took finding it to be confident about the answer.

**The contract holds one pooled token balance.** Streams are accounting entries against it; there is
no per-stream segregation at the token layer. So an accrual bug that over-credits stream A does not
merely over-pay A — it pays A out of the pool that B's deposit is sitting in. That turns an accounting
bug into a race in which fast recipients drain slow ones, and the loss lands on people whose own
streams were never buggy. Freezing withdrawals stops that race. It is a real argument.

It loses for two reasons.

**First, the containment belongs in an invariant, not in a key.** Every withdrawal already has the
stream entry loaded. Assert, on every payout:

```
payout <= stream.total - stream.withdrawn
```

and the same for `cancel`'s combined refund and payout. One comparison, no extra storage read, no
extra entry in the footprint. It bounds any stream's lifetime extraction to its own deposit, so an
accrual bug can drain at most the buggy stream and can never reach a neighbour's. The pooled-balance
argument is the best case for a withdrawal pause and it is answered by a line of code that is cheaper,
always on, and requires nobody to be awake.

This check is only sound because of the decision in [#32](https://github.com/StelFlow-labs/StelFlow/issues/32):
`total` is the **measured balance delta** at creation, not the requested amount, so the bound is
against money that actually arrived rather than a number the sender supplied. Had that gone the other
way, this check would have been comparing against a figure a hostile token could inflate.

To be honest about its limits: it contains bugs in *accrual*. It does not contain a bug that corrupts
the `withdrawn` counter itself, or one that lets the wrong caller pass `require_auth`. But a pause
doesn't contain those either — see the second reason.

**Second, a pause arrives after the money.** Its defensive value depends entirely on humans reacting
faster than a script. Stellar closes ledgers in a few seconds; an attacker with a working exploit
submits in the first one, batched across as many streams as the read budget allows. Detecting the
anomaly, waking whoever holds the key, and landing the pause transaction is minutes at the very best
and hours realistically. The exploit is over.

The asymmetry is what settles it: **a withdrawal pause's defensive value is conditional on human
reaction time, and its abuse value is not.** It is unreliable exactly when needed and perfectly
reliable when misused — by a compromised key, a coerced maintainer, or a court order. A capability
with that profile should not exist.

If an incident genuinely is only survivable by freezing earned funds, T5's original sentence stands
and I did not find a counter-example to it: the design is wrong somewhere else, and the fix belongs
there.

### Shape of the pause

Three properties, each of which exists because the contract is non-upgradeable and therefore can
never be patched later:

**It auto-expires.** A pause set at time *T* lifts automatically at *T* + 30 days unless renewed.
Without expiry, a pause key that is lost, destroyed, or abandoned while engaged would disable
`create_stream` **permanently**, with no upgrade available to rescue it — a small power becoming an
irreversible one through nothing but neglect. Renewal is one transaction, so erring short is cheap
and erring long is not; 30 days is comfortably enough to publish a migration and let cancelable
streams unwind. The constant is compiled in and, being non-upgradeable, can never be changed, which
is itself an argument for the shorter end.

**It is one key, deliberately.** Multisig is the right shape for a power that must be *hard* to use.
This is a power that must be *fast* to use — its whole job is stopping new deposits into a contract
you have just discovered is broken — and its worst-case abuse is a 30-day pause on new business,
which harms nobody who already has funds inside. Note the symmetry: the power that would have needed
many keys is the one this decision removed; the power that survives is small enough for one.

**It can be renounced.** The pauser address can transfer the role or set it to none, permanently. That
lets the project reach a genuinely zero-privilege state once the contract has been in production long
enough to trust — and because the contract is non-upgradeable, that state is final. It is not the
default: renouncing discards the only incident response the design retains, and that trade belongs to
whoever is running the deployment at the time, not to this document.

## The interaction, in both directions

The issue predicted these two questions interact. They do, in three ways, and only one was the
expected one.

**1. A withdrawal pause would have voided a timelock anyway.** If a pause can block `withdraw`, then
"recipients can exit during the timelock" is false whenever the same party holds both keys: pause,
wait out the timelock, upgrade. The timelocked-upgrade design is only coherent alongside an
unpausable `withdraw`. Since the timelock loses on its own arithmetic, this is now moot — but it
confirms that answering these separately would have produced an incoherent pair.

**2. Non-upgradeability makes the pause both more necessary and more dangerous.** More necessary,
because it is the *only* incident response left: with no patch available, stopping new deposits into
a known-broken contract is the entire playbook. More dangerous, because every property of the pause
is now permanent — a bad scope, a missing expiry, or a stuck key can never be corrected. That is why
the pause is scoped to one entry point and why expiry is mandatory rather than a nicety. This
direction of the interaction was the one I didn't expect, and it is the one that shaped the design.

**3. Non-upgradeability makes recovery paths a now-or-never decision.** The issue said it: a contract
that can never be changed needs its recovery paths designed up front, because none can be added later.
Mutual cancel is that. Milestone deadlines
([T3](threat-model.md#t3--an-approver-who-never-comes-back), still open) are the other one, and this
decision raises their urgency from "worth doing" to "decide before Phase 2 or never" — a deadline
cannot be retrofitted onto streams created without one.

## What this decision gives up

- **A bug in shipped code is permanent.** No patch, ever. The only responses are the pause, a public
  migration, and the two-signature exit. This raises the stakes on audit and on Phase 1 test coverage
  considerably, and it should.
- **Streams where one party is unreachable cannot migrate.** Mutual cancel needs two signatures. A
  non-cancelable stream whose recipient has lost their key, or whose sender has disappeared, stays on
  the old contract until it completes. This is the honest residual and it is the same residual as T3.
- **A "global admin" now exists, narrowly.** The claim in
  [architecture.md](architecture.md#authorization) needed amending from "there is no global admin"
  to a precise statement of what the one global role can and cannot do. Precision beats a clean
  sentence that has quietly stopped being true.
- **Protocol changes can strand assumptions.** A non-upgradeable contract cannot adapt to a Soroban
  change that moves the ground under it. The mitigation is to compile in as few network constants as
  possible — see the consequence for `ttl-strategy.md` below, which this decision forced.

## Consequences for the rest of the design

- **No upgrade function exists in the source.** Not gated, not admin-guarded, not present. A guarded
  upgrade function is a key someone can be compelled to use; an absent one is not.
- **No config admin either.** [ttl-strategy.md](ttl-strategy.md#recommendation) proposed storing
  tunable TTL thresholds in instance storage, "mutable by whatever admin/governance process the
  upgradeability question settles." That process is now: none. The thresholds must therefore be
  *derived* at call time from `env.storage().max_ttl()` — which that same document already recommends
  as the better practice — rather than stored and administered. Nothing about TTL is tunable, and
  nothing needs to be.
- **`cancel` takes two authorizations when `cancelable = false`.** The
  [behaviour spec](behaviour.md#feature-cancel) scenario for non-cancelable streams is
  amended: rejected when the sender alone authorizes, permitted when both do.
- **A solvency assertion on every payout.** `payout <= total - withdrawn` per stream, on `withdraw`
  and `cancel`. It is the structural answer to the pooled-balance argument above and should be an
  explicit invariant in the Phase 1 test suite, not an implicit consequence of correct accrual.
- **Instance storage holds exactly three admin-ish fields:** the pauser address (or none), a paused-until
  timestamp, and nothing else. Not a config namespace — a namespace invites growth, and growth here is
  permanent.
- **`create_stream` gains one rejection case**, and `withdraw` gains none. That asymmetry is the whole
  policy expressed as code.
- **SECURITY.md scope.** "Upgrade authority" and "pause abuse" leave the threat surface entirely,
  because the capabilities are gone rather than guarded. What replaces them is narrower and worth
  reporting: a bug that lets `create_stream` be called while paused, a pause that fails to expire, or
  any path that lets one stream's payout exceed its own deposit.

## Prior art

Concrete beats first principles, and the issue asked for it. Two patterns are worth naming, with an
honest note on what I could and couldn't verify.

**The EVM `whenNotPaused`-on-everything pattern** — where a pause modifier is applied uniformly across
a contract's functions, withdrawals included — is the thing this decision is most directly rejecting.
It is convenient precisely because it is undiscriminating, and undiscriminating is the defect: it
makes "stop new entry" and "freeze existing balances" the same switch, when they have opposite risk
profiles. The entry-point table above exists to keep those two apart permanently.

**DeFi governance timelocks cluster around 48 hours.** Set that against the table in
[§ Why the standard answer doesn't transfer](#why-the-standard-answer-doesnt-transfer): two days
against a four-year vest rescues well under one percent. The convention is calibrated for vaults, and
importing it here without checking the arithmetic is exactly the mistake this document exists to
avoid.

<!-- TODO(maintainer): verify before this is cited anywhere load-bearing (a grant application, an
audit brief). Sablier is the closest prior art — streaming payments, same problem shape — and my
recollection is that its V2 core shipped non-upgradeable with a periphery layer for the mutable
parts. Confirm against their current governance docs rather than trusting this note, and if it holds,
the two-layer split is worth evaluating on its own merits: it is a way to keep custody immutable
while leaving convenience code replaceable. Soroban-specific prior art on immutable custody contracts
would be more valuable still and I did not find any I could verify. -->

## Next

- [threat-model.md](threat-model.md) — T1 and T5 now record these decisions; T3 is amended.
- [../architecture.md](architecture.md#authorization) — the amended authorization claim, and open
  questions 4 and 5 marked settled.
- [../specs/behaviour.md](behaviour.md) — the scenarios this makes writable, including
  two-signature cancel and the pause's scope.
- [milestone-revocation.md](milestone-revocation.md) — the other half of "what powers exist over a
  live stream," decided the same way and for the same reason.
