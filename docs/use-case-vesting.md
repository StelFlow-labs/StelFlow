# Use case: vesting with cliffs

Part of [issue #3](https://github.com/StelFlow-labs/StelFlow/issues/3). Everything here describes
software that exists on **testnet only**, unaudited.

This is the case where [TTL archival](ttl-strategy.md) stops being a footnote and becomes the thing
that will actually bite you.

## The actors

- **A company or protocol treasury** issuing an equity-like grant. The `sender`.
- **An employee or founder** vesting over four years. The `recipient`.
- **No approver.** Standard vesting is time-based. A performance-gated portion is possible and
  discussed below, but it is the exception.

## What they do today, and why it is bad

A vesting contract per grant, or a spreadsheet plus quarterly manual transfers.

- **The recipient cannot verify their own position.** They are told what has vested. Checking means
  asking the party who benefits from the answer.
- **Cliffs are enforced by whoever runs payroll**, which means a cliff is a promise rather than a
  property.
- **Bespoke vesting contracts are a security liability.** Every company deploying its own is a fresh
  chance to get the arithmetic wrong, and they are rarely audited.

## How a stream is configured for it

```
total       = 400,000 tokens over 4 years
start       = grant date
end         = start + 1461 days        (four years, one leap day)
cliff       = start + 365 days         (the standard one-year cliff)
cancelable  = false                    (the whole point)
milestones  = []
```

**`cancelable = false` is the entire guarantee, and it now has a precise meaning.** It does not mean
the stream can never end. It means **the sender cannot end it unilaterally** — cancelling requires
the recipient's signature alongside the sender's. The recipient's protection is intact; what they
gain is an option that needs their own consent, and what the design gains is that a vest is not a
permanent dead end if both parties want out. That distinction was
[settled in #33](upgradeability-and-pause.md#the-fix-cancel-by-unanimous-consent) and exists because
the contract can never be upgraded to add an escape hatch later.

**The cliff is a predicate, not a state.** During the first year the stream is `Streaming` and
accruing normally — `streamed_total` climbs every second — but `claimable` evaluates to zero. On day
365 the accrued 25% becomes claimable in one step. The recipient can watch this happen; that is the
difference between a cliff as a property and a cliff as a promise.

### If part of the grant is performance-gated

Some grants gate a slice on a target being hit. That works, and the configuration goes the **opposite
way** from a grant:

```
milestones:
  [0] amount    = 100,000
      approver  = board multisig
      deadline  = end + 90 days
      on_expiry = ToSender
```

`ToSender`, not `ToRecipient`. A performance condition that pays out because nobody looked is not a
performance condition. The recipient is accepting, in advance and visibly, that an unassessed target
resolves against them — which is a legitimate term when it is agreed at signing and a nasty surprise
when it is not. [The deadline decision](milestone-deadlines.md) refuses to hardcode this precisely
because grants and vests want opposite answers.

## The constraint this case actually runs into

**A four-year stream will archive, and TTL is the real operational problem here.**

Nothing is pushed on chain. A vesting stream that nobody touches simply sits there, and Soroban's
[state archival](ttl-strategy.md) will eventually archive its entry. The measured research is
unambiguous: **no single TTL extension can cover a multi-year stream.** The network's maximum entry
TTL is far shorter than four years, so the entry must be re-extended periodically for the stream's
whole life.

What follows:

- **Withdrawing extends the TTL as a side effect.** A recipient who withdraws even twice a year never
  thinks about archival. The contract extends on every read of a live stream, so ordinary use is the
  mechanism that keeps a stream alive.
- **The cliff year is the dangerous window.** For the first 365 days `claimable` is zero, so there is
  no reason to call `withdraw` — and therefore nothing keeping the entry warm. This is the one period
  where a vesting stream is most likely to archive, and it is exactly when the recipient is least
  engaged.
- **`touch` is permissionless for this reason.** Anyone — the company, the recipient, a third-party
  keeper — can call it to extend a stream's TTL. It mirrors `ExtendFootprintTTLOp`, which has no auth
  check either, so gating it would buy nothing.
- **Archival is not loss.** An archived entry is restorable by anyone willing to pay the rent, and
  Protocol 23 restores it automatically for anything driven through simulation. It costs a fee and a
  surprise, not the funds.

**StelFlow does not operate a keeper**, and [ttl-strategy.md](ttl-strategy.md) declines to commit to
one: it would be a single point of failure dressed up as decentralisation, and if it quietly stopped,
nobody would notice until entries started archiving.

## What can still go wrong

- **A lost recipient key is unrecoverable, and vesting is where it hurts most.** Four years of
  accrual to an address nobody can sign for, with no admin who could reassign it and no upgrade that
  could add one. This is the direct cost of the no-admin property.
- **Cliff plus non-cancelable is the worst archival combination**, per above. An operator should
  schedule TTL extensions for the cliff period rather than assume the recipient will.
- **The company cannot claw back a departed employee's unvested tokens without their signature.**
  Under `cancelable = false` that is the deal, and a company that wants unilateral clawback on
  departure should create the stream cancelable and tell the employee that is what they are getting.
  Choosing `false` and then wanting out later is not a situation the contract will rescue you from.
- **A four-year stream outlives protocol assumptions.** Network settings change between protocol
  versions — [ttl-strategy.md](ttl-strategy.md) documents one that already did. The contract compiles
  in no ledger counts and derives everything from `max_ttl()` at call time, which is the mitigation,
  but a contract that cannot be upgraded is betting that this is enough.
- **Token choice is permanent for the stream's life.** Four years is a long time to be exposed to an
  issuer's [clawback flag](threat-model.md#t7--issuer-clawback).

## Next

- [ttl-strategy.md](ttl-strategy.md) — the archival economics this case runs into first.
- [upgradeability-and-pause.md](upgradeability-and-pause.md) — what `cancelable = false` now means.
- [milestone-deadlines.md](milestone-deadlines.md) — why `on_expiry` points the other way here.
