# Use case: grant disbursement

Part of [issue #3](https://github.com/StelFlow-labs/StelFlow/issues/3). Everything here describes
software that exists on **testnet only**, unaudited.

This is the case StelFlow exists for. If milestone gating does not pay for itself here, it does not
pay for itself anywhere.

## The actors

- **A grant programme** — an obviously fictional *Orbit Foundation*, used as an example throughout.
  It is the `sender`.
- **A grantee team** building something over four months. The `recipient`.
- **A review committee**, three people who assess deliverables. Named as the `approver` on each
  milestone — as a multisig address, or eventually as a
  [Trustless Work escrow](architecture.md#trustless-work-integration).

The committee is a separate party from the funder, and that separation is the entire point. When the
funder is also the approver, [T6](threat-model.md#t6--the-sender-controls-the-approver) applies and
the grantee should know it.

## What they do today, and why it is bad

Tranched lump sums: 30% on signature, 30% at the midpoint review, 40% on completion.

- **The grantee is cash-starved between tranches.** They are doing the work for month two with money
  paid in month zero. Small teams fail here for reasons unrelated to the quality of their work.
- **Every tranche is a manual payment**, so every tranche is a chance for the transfer to be late,
  wrong, or forgotten.
- **A late review costs the grantee real money.** If the midpoint review slips three weeks, the
  grantee funds three weeks of salaries themselves.

The last point is the one that matters. A lump-sum tranche makes the reviewer's *punctuality* a
financial risk borne by the grantee.

## How a stream is configured for it

One stream. A base tranche the grantee draws continuously, plus gated tranches for the deliverables:

```
total       = 120,000 USDC over 4 months
base        = 60,000            (implied: total minus the gated amounts)
start       = grant start
end         = start + 120 days
cliff       = start             (none — the grantee needs to eat from day one)
cancelable  = true              (a funder needs an exit if the work stops)

milestones:
  [0] amount    = 30,000
      approver  = committee multisig
      deadline  = end + 30 days
      on_expiry = ToRecipient
  [1] amount    = 30,000
      approver  = committee multisig
      deadline  = end + 30 days
      on_expiry = ToRecipient
```

**The base tranche is what fixes the cash-starvation problem.** 60,000 over 120 days streams at 500
USDC/day, continuously, from day one. The grantee can pay salaries while doing the work rather than
from a payment that arrived four months ago.

**The gated tranches accrue on the same clock but stay unclaimable.** By day 60, milestone 0 has
accrued 15,000 — it is sitting in `held`, visible to both parties, belonging to nobody yet. When the
committee approves, [everything it has held is released at once](concepts.md#milestone-gates),
including accrual from before the approval. Approval does not accelerate the schedule; it unlocks
what the schedule already produced.

**A late review no longer costs the grantee their runway.** If the committee approves on day 75
instead of day 60, the grantee receives the same amount — just later, and with the base tranche
carrying them in the meantime. The reviewer's punctuality is decoupled from the grantee's solvency.
That is the actual product.

### Why `on_expiry = ToRecipient` here

This is the interesting configuration choice, and it goes the opposite way from vesting.

A deadline exists because a committee can dissolve, lose keys, or simply stop answering —
[T3](threat-model.md#t3--an-approver-who-never-comes-back). Without one, a non-cancelable stream
whose approver vanishes strands the tranche permanently, and the contract
[can never be upgraded to add a recovery path later](upgradeability-and-pause.md).

Pointing it at the *recipient* encodes a specific judgement: **the funder chose the committee, so the
funder carries the risk of the committee failing.** A grantee who did the work should not lose a
tranche because the people assessing it stopped replying. Set it to `ToSender` and you have handed
the committee a way to deny payment by doing nothing at all, which is worse than denying it
explicitly.

The deadline sits 30 days after `end` — comfortably past the last possible delivery, and
[required to be at or after `end`](milestone-deadlines.md) so expiry never resolves a tranche that is
still accruing.

## What can still go wrong

- **The committee can approve work that turns out to be fraudulent, and there is no remedy.**
  [Approval is final](milestone-revocation.md); once a tranche is released it stays released. If a
  real dispute process is needed, the answer is to name a Trustless Work escrow as the approver and
  let it withhold approval until its own process concludes — revocation's actual use case, solved by
  not approving yet.
- **A funder who names themselves approver has effectively made the grant discretionary.** Nothing in
  the contract prevents it, and cancellation rule 4 returns unapproved tranches to the sender in
  full. [T6](threat-model.md#t6--the-sender-controls-the-approver) accepts this as a consequence of
  the counterparty model and mitigates it by disclosure — which means the SDK and dashboard have to
  make approver identity unmissable before a grantee signs. **A grantee should check who the approver
  is before accepting.**
- **`cancelable = true` means the funder can end the grant unilaterally.** The grantee keeps what has
  streamed, but loses the rest. That is the correct shape for a grant and the grantee should
  understand it going in.
- **The Trustless Work integration does not exist.** It is a design intention — an approver may be a
  contract address, which is the mechanism that would make it work — and there has been no
  conversation with them. Do not present it as a partnership.
- **Milestones cost storage.** Each one lives inside the stream entry and counts against
  [`MAX_MILESTONES_PER_STREAM`](architecture.md#the-per-transaction-read-budget). Two is
  unremarkable; a grant with fifteen deliverables needs restructuring, not a bigger cap.

## Next

- [milestone-deadlines.md](milestone-deadlines.md) — why `on_expiry` is a negotiated term rather than
  a protocol default.
- [threat-model.md](threat-model.md#t6--the-sender-controls-the-approver) — the approver-choice risk,
  accepted and disclosed.
- [use-case-vesting.md](use-case-vesting.md) — the same mechanism configured the opposite way.
