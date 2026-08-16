# Use case: DAO payroll

Part of [issue #3](https://github.com/StelFlow-labs/StelFlow/issues/3). Everything here describes
software that exists on **testnet only**, unaudited.

## The actors

- **The DAO treasury**, operating a multisig or a governance contract. It is the `sender` on every
  stream.
- **Contributors** — twenty to sixty people on part-time engagements, joining and leaving throughout
  the year. Each is a `recipient` on their own stream.
- **Nobody as approver.** Payroll is time-based; there is no gate. That matters, because it makes
  this the cheapest possible stream shape.

## What they do today, and why it is bad

A monthly multisig batch. Someone assembles a spreadsheet, someone else checks it, three or four
signers approve, one transaction goes out.

Three problems, in increasing order of how much they actually hurt:

1. **The signers are a bottleneck.** Payroll is late whenever a signer is on a plane. Everyone knows
   this and nobody says it.
2. **A contributor who leaves on the 3rd is either overpaid for the month or unpaid for three days.**
   Both get resolved by someone's judgement, off-chain, which is exactly the kind of small
   discretionary decision that erodes trust in a treasury.
3. **A contributor cannot see what they have earned.** They know what they are owed at month end.
   Between those points there is nothing to look at, which is a materially different relationship
   with your employer than a salaried job.

## How a stream is configured for it

One stream per contributor, created at the start of an engagement:

```
total       = monthly rate x months of the engagement
start       = engagement start
end         = engagement end
cliff       = start          (none — payroll should not have a cliff)
cancelable  = true           (see below)
milestones  = []             (none — this is the cheapest shape)
```

A contributor on 4,000 USDC/month for a six-month engagement gets `total = 24,000` USDC, streaming
over 181 days. They can withdraw whenever they want; most will do it monthly out of habit, some
weekly, and the arithmetic is identical either way because
[accrual is recomputed rather than accumulated](architecture.md#arithmetic).

**Cancelable = true is the right call here, and it is a real trade.** It means the treasury can end
an engagement unilaterally, keeping only what has streamed. That is what an at-will engagement
already is. Setting it false would mean neither party could end the stream without the other's
signature — appropriate for a fixed-term guarantee, wrong for ongoing payroll.

**Someone leaving on the 3rd is now arithmetic.** The treasury cancels; the contributor keeps the
three days that streamed; the rest returns. No judgement call, no spreadsheet, no awkward
conversation about whether to round up.

## The constraint this case actually runs into

**Batching against the per-transaction read budget**, and it is the interesting engineering problem
in this whole document.

One stream is one persistent entry. A treasury paying sixty contributors has sixty entries, and
anything that touches them all at once — a batch top-up, a batch TTL extension — is bounded by
[the per-transaction read budget](architecture.md#the-per-transaction-read-budget). Testnet's
`tx_max_disk_read_entries` was measured at 200 (see [ttl-strategy.md](ttl-strategy.md)), so sixty
streams fit comfortably in one transaction *today* — but that figure is a network setting that can
change, and the contract deliberately compiles none of it in.

What follows for an operator:

- **Withdrawals are per-recipient and never batched by the DAO.** Each contributor withdraws their
  own stream; the treasury is not in that path at all. This is the property that removes the signer
  bottleneck, and it is why payroll is a *good* fit rather than merely a possible one.
- **`bump_many` is where batching matters**, not payment. Sixty dormant streams need their TTLs kept
  alive, and that is one bounded batch rather than sixty transactions.
- **The SDK chunks; the contract does not.** Any batch entry point takes a bounded vector and
  documents its maximum, and the SDK splits larger sets across transactions rather than letting one
  fail on resource limits.

## What can still go wrong

- **The treasury must fund the whole engagement upfront.** Six months of payroll for sixty people is
  locked in the contract from day one. This is the single biggest objection to StelFlow for payroll,
  and [LlamaPay's open-ended model](comparison.md#llamapay--evm-a-genuinely-different-funding-model)
  is a real alternative that trades the recipient's guarantee for the treasury's capital efficiency.
  If capital efficiency dominates for you, StelFlow is the wrong tool and this page should say so.
- **A contributor who loses their key loses the stream.** There is no recipient-reassignment path and
  no admin who could add one. The funds accrue to an address nobody can sign for. Covered in
  [the FAQ](faq.md), and it is the direct cost of having no admin over funds.
- **Long engagements archive.** A twelve-month stream that nobody touches will hit
  [TTL archival](ttl-strategy.md). A contributor who withdraws monthly keeps their own entry alive
  without thinking about it; one who lets it run untouched for a year may need to pay a restore fee
  before their first withdrawal. The dashboard should surface this rather than let it surprise
  someone.
- **Clawback-enabled assets remain the issuer's.** If the DAO pays in an asset whose issuer enabled
  [clawback](glossary.md#clawback-issuer-sense), that issuer can pull funds out of a live stream and
  StelFlow cannot stop it — [T7](threat-model.md#t7--issuer-clawback), accepted and unfixable. Check
  the flag before choosing the payroll asset.
- **Streaming is not employment law.** Nothing here handles tax withholding, benefits, notice
  periods, or jurisdiction. A stream is a payment mechanism, not a contract of employment.

## Next

- [use-case-grant-disbursement.md](use-case-grant-disbursement.md) — where milestones earn their cost.
- [architecture.md](architecture.md#the-per-transaction-read-budget) — the batching constraint above.
- [comparison.md](comparison.md) — the open-ended alternative, described fairly.
