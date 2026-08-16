# Testing StelFlow end to end

A walkthrough for trying every part of the app with a real wallet, on Stellar's
test network. **Nothing here uses real money.** Test XLM is free, unlimited, and
worthless.

Allow about 20 minutes for the full run, or 5 minutes for the short version.

---

## What you need

### The wallet: Freighter

**Use [Freighter](https://www.freighter.app/).** It is the wallet built by the
Stellar Development Foundation, it has the best support for Soroban contracts
(which is what StelFlow is), and it is the one this app defaults to.

The app also supports xBull, Albedo, Rabet, LOBSTR and Hana if you already use
one of those. Everything below assumes Freighter.

1. Install the extension from [freighter.app](https://www.freighter.app/) —
   Chrome, Brave, Edge and Firefox all work.
2. Create a wallet and **write the recovery phrase down**. It is a test wallet,
   but getting into the habit costs nothing.
3. **Switch to Testnet.** Open Freighter, click the network name at the top, and
   choose **Test Net**. This is the step people miss, and the app will refuse to
   sign anything until you do it.

### Test funds

Every testnet account can be topped up for free, instantly.

- **Easiest:** open Freighter on Testnet. New accounts usually show a
  *Fund with Friendbot* button. One click and you have 10,000 XLM.
- **Or:** visit `https://friendbot.stellar.org?addr=YOUR_ADDRESS`, pasting your
  address from Freighter.

You need funds in **every** account you plan to sign with. For the full
walkthrough that is three accounts — see below.

### Three accounts, so you can play every role

A stream has up to three distinct parties, and the app only offers you the
actions your connected address is entitled to. To see all of them, create three
accounts in Freighter (use the account switcher, then *Add account*) and fund
each one:

| Account | Nickname it | What it does |
|---|---|---|
| 1 | **Payer** | Creates and funds streams, and can cancel them |
| 2 | **Earner** | Receives the stream and withdraws |
| 3 | **Reviewer** | Signs off milestones |

Keep all three addresses somewhere you can copy from — a scratch note is fine.

---

## The short version (5 minutes)

If you only want to see the core idea working:

1. Open the app and connect as **Payer**.
2. Create a stream: recipient = **Earner**, amount = `10` XLM, over `5` minutes,
   cliff `0`, no milestones.
3. Watch the number rise. It updates every second.
4. Switch Freighter to **Earner**, reload, and press **Withdraw**.
5. Check Freighter's balance. The XLM is there.

That is the whole product. Everything below tests the edges.

---

## The full walkthrough

### 1 · Create a stream with a gate

Connect as **Payer**.

| Field | Value |
|---|---|
| Who is being paid | your **Earner** address |
| Amount | `20` XLM |
| Over how long | `10` minutes |
| Cliff | `0` |
| I can cancel this on my own | ticked |

Then **Add a milestone**:

| Field | Value |
|---|---|
| Amount | `8` XLM |
| Who signs it off | your **Reviewer** address |
| Give them a deadline | `0` |
| If the deadline passes | *It comes back to me* |

Press **Deposit and start streaming** and approve the transaction in Freighter.

**What to check.** Beneath the form it should say 12 XLM flows steadily and 8 XLM
waits behind a gate. The new stream appears at the top of the list with a
**Waiting on a sign-off** badge.

> **Try this:** set the approver to your own **Payer** address instead. A warning
> appears explaining that you could refuse to approve and then cancel to take the
> tranche back. That is deliberate — the app is telling the recipient something
> that is true and awkward.

### 2 · Watch it flow

Leave it a minute. The big number should climb every second.

**What to check.** The coloured bar has a green section that grows and a purple
section that also grows. Purple is money that has been earned on the clock but
cannot be taken yet — that is the gate doing its job.

### 3 · Withdraw as the Earner

Switch Freighter to **Earner** and reload the page.

**What to check.** The **Withdraw** button now appears, and **End it** does not —
the Earner cannot cancel someone else's stream.

Press **Withdraw** and sign.

**What to check.** A green message reports what was sent. The bar's blue "Taken"
section appears. Your Freighter balance goes up by roughly the claimable amount,
minus a network fee of a fraction of a cent.

### 4 · Sign off the milestone

Switch Freighter to **Reviewer** and reload.

**What to check.** You see **Sign off milestone**, and neither Withdraw nor End
it — the Reviewer's only power is to open the gate.

Press it and sign.

**What to check.** The purple section disappears and the green section jumps.
Crucially it jumps by *everything the gate had been holding since the stream
started*, not just from this moment. Approving releases the past, it does not
start a new clock.

### 5 · Withdraw the released money

Switch back to **Earner**, reload, withdraw again. The tranche that was locked is
now yours.

### 6 · Cancel, and see the split

Switch to **Payer**. Open **Details** on the stream first and read
**If it ended now** — that is exactly what you will get back.

Press **End it** and sign.

**What to check.** The message reports two numbers: what came back to you, and
what stays with the recipient. Add them to what the Earner already withdrew and
you get the original 20 XLM, to the stroop. Nothing is lost and nothing is
invented.

The Earner can still withdraw their share afterwards — cancelling freezes the
clock, it does not claw back what was earned.

---

## Testing the awkward cases

These are the ones worth trying, because they are where the design decisions show
up.

### A stream nobody can cancel alone

Create a stream with **I can cancel this on my own** *unticked*.

As **Payer**, press **End it**. Freighter will ask for a signature it cannot
provide alone and the transaction will fail — because cancelling now needs the
Earner's signature too. This is what `cancelable = false` actually means: not
*never*, but *not without the other person*.

### A cliff

Create a stream with **Cliff** set to `3` minutes.

**What to check.** For the first three minutes the claimable figure stays at
zero, but open **Details** and *Earned so far* is climbing. The money is
accumulating; it just cannot be moved yet. At three minutes the whole lot becomes
claimable at once.

### A milestone deadline

Create a stream with a milestone whose deadline is `0` days and expiry set to
*They get it anyway*. Wait for the stream to finish.

**What to check.** With no deadline, an unsigned milestone waits forever — the
Earner never gets that tranche unless the Reviewer signs or the Payer cancels.
Now try one with a deadline: once it passes, the tranche resolves on its own, with
no transaction from anybody.

### Withdrawing twice in a row

Press **Withdraw**, then immediately press it again.

**What to check.** The second attempt reports *Nothing to withdraw yet* rather
than sending a zero-value payment. Ledger time moves in a few-second steps, so
inside the same step there is genuinely nothing new.

### A stream that has already finished

Let a short stream run past its end, then withdraw.

**What to check.** You receive exactly the deposit — not a stroop more, however
long you wait. Accrual stops at the end; it does not keep counting.

---

## If something goes wrong

| What you see | What it usually means |
|---|---|
| Wallet won't connect | Freighter is locked, or the site is not allowed. Open the extension, unlock, and reload. |
| *Signature declined* | You dismissed the Freighter popup. Try again. |
| Transaction fails immediately | Freighter is on the wrong network. It must be **Test Net**. |
| *Nothing to withdraw yet* | Nothing new has accrued since your last withdrawal, or you are inside a cliff. |
| *New streams are paused* | Stream creation is temporarily stopped. Existing streams are unaffected — you can still withdraw, sign off and cancel. |
| Balance looks stuck | The page polls every 15 seconds for other people's transactions. Reload to force it. |
| *This stream has already been cancelled* | Someone cancelled it while your page was open. Reload. |

---

## Running it yourself

The hosted app points at a contract already deployed to testnet. To run the whole
thing locally against that same contract:

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

To deploy your own copy of the contract instead:

```bash
pnpm contract:test                     # 75 tests
stellar contract build

stellar contract deploy \
  --wasm target/wasm32v1-none/release/stelflow.wasm \
  --source YOUR_KEY --network testnet \
  -- --pauser "\"$(stellar keys address YOUR_KEY)\""
```

Put the contract id it prints into `deployments.json`, run `pnpm bindings`, and
restart the dev server.

---

## What you are not testing

Worth being clear about, because a smooth walkthrough can be misleading:

- **This is not audited.** It works, and that is a different claim from it being
  safe. The contract can never be upgraded, so a bug found later could not be
  patched.
- **Test XLM is not money.** Nothing here proves anything about handling real
  value.
- **The activity feed is not full history.** It reads recent contract events
  directly from the network, which keeps a rolling window. Older activity drops
  off — reconstructing it properly is a job for an indexer that does not exist
  yet.

If you find something that behaves differently from this document, that is a bug
in one of the two. Please
[open an issue](https://github.com/StelFlow-labs/StelFlow/issues/new/choose).
