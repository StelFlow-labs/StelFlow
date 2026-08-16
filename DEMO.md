# 120-second demo script

A recording plan for showing StelFlow to the team. Timed, rehearsed, and built
so the interesting thing happens on camera rather than in a cut.

**The one idea to land:** money that arrives every second, and a portion of it
that grows while it waits for a yes.

---

## Before you hit record

**15 minutes of setup. Do not skip this — most of the demo's risk is here.**

1. **Three funded testnet accounts in Freighter**, named so they read clearly on
   screen: `Payer`, `Earner`, `Reviewer`. Fund all three.
   ([Full instructions](TESTING.md#what-you-need).)
2. **Pre-create one stream** so you have something already flowing when you
   start. Payer → Earner, `50` XLM over `30` minutes, one `20` XLM milestone with
   `Reviewer` as approver. This is your establishing shot; a stream created live
   starts at zero and looks like nothing is happening.
3. **A second Freighter window or profile** already switched to `Earner`, so the
   account switch is a window swap rather than 20 seconds of clicking.
4. **Browser at 1440×900**, zoom 110%, dark mode. Close every other tab.
5. **Do a full dry run.** Confirm the faucet worked and every account can sign.
6. **Have the app open at the landing page**, scrolled to the top.

> **Timing note:** the withdraw and sign-off transactions each take 5–8 seconds to
> confirm. That is real and worth showing — but talk over it rather than waiting
> in silence. The script below has lines written for exactly those gaps.

---

## The script

### 0:00 – 0:15 · The hook

**On screen:** the landing page hero. The counter is already ticking.

> "This number has been going up since the page loaded. Nobody sent anything, no
> scheduled job ran, and nobody approved it. That is the whole idea behind
> StelFlow — money that arrives by the second instead of at the end of the month."

*Let the counter run visibly for two seconds before moving on.*

---

### 0:15 – 0:30 · Why it matters

**On screen:** scroll slowly to *Built for three jobs in particular*.

> "It is built for three situations: paying a team, funding work in stages, and
> vesting over years. All three are cases where a single lump sum is too blunt
> and a recurring transfer is too easy to forget."

---

### 0:30 – 0:50 · The live stream

**On screen:** click **Open the app**. Your pre-made stream is at the top.

> "Here is a real stream on Stellar's test network. Fifty XLM over thirty
> minutes. The green part is money the recipient can take right now, and it grows
> every second."

*Point at the bar.*

> "The purple part is the interesting bit. That is twenty XLM that is filling up
> on exactly the same clock — but it is waiting for someone to sign it off."

---

### 0:50 – 1:15 · Withdraw as the Earner

**On screen:** switch to the `Earner` window, reload, press **Withdraw**, sign.

> "I am now the person being paid. Notice the buttons changed — I can withdraw,
> but I cannot cancel someone else's stream. The app only ever offers you what
> you are actually entitled to do."

*While the transaction confirms:*

> "Withdrawing does not affect the total. Take it daily or once at the end, you
> end up with exactly the same amount. That is worth saying because it is not
> true of most payment systems."

*When it lands:* point at the wallet balance.

> "And it is in the wallet."

---

### 1:15 – 1:40 · Open the gate

**On screen:** switch to `Reviewer`, reload, press **Sign off milestone**, sign.

> "Now I am the reviewer. My only power is to open that gate — I cannot move the
> money, redirect it, or touch the part that was already flowing."

*While it confirms:*

> "Watch what happens to the purple section."

*When it lands:*

> "It did not start paying out from now. Everything the gate had been holding
> since day one was released at once. The recipient is not punished for how long
> the review took — which is exactly the problem this solves."

---

### 1:40 – 2:00 · The honest close

**On screen:** back to the landing page, scrolled to *what StelFlow deliberately
cannot do*.

> "The part I would most want you to look at is what it cannot do. There is no
> upgrade button, so nobody can change the rules later. There is no admin who can
> freeze or redirect your money. The one emergency switch can only stop new
> streams being created — it cannot touch a stream that already exists, and it
> expires by itself."

*Pause briefly on the amber box.*

> "It has not been audited and it is on a test network, and we would rather say
> that ourselves than have you find it. Everything else is running today."

---

## Timing at a glance

| Time | Beat | Watch for |
|---|---|---|
| 0:00 | Ticking counter | Let it visibly move |
| 0:15 | Three use cases | Scroll slowly |
| 0:30 | Real stream, green and purple | Point at the bar |
| 0:50 | Withdraw | Talk over the confirmation |
| 1:15 | Sign off the gate | The jump is the payoff |
| 1:40 | What it cannot do | End on the honesty |

---

## If you have a second take

Things worth cutting if you run long, in order:

1. The three-use-cases scroll (0:15–0:30). Nice framing, not essential.
2. The wallet-balance close-up after withdrawing.
3. The second half of the withdrawal line about frequency not mattering.

Things **not** to cut:

- The ticking counter. It is the fastest explanation of the product.
- The gate releasing everything at once. It is the differentiator, and it is
  genuinely surprising the first time.
- The closing honesty. It is what makes the rest credible.

---

## Common recording problems

| Problem | Fix |
|---|---|
| Transaction hangs | Freighter is on the wrong network. Always check Test Net before recording. |
| Buttons missing after switching accounts | Reload the page — the app reads your address at load. |
| Nothing appears claimable | Your pre-made stream is inside its cliff. Create it with cliff `0`. |
| Numbers too small on screen | Zoom to 110–125%. The big figures are designed for it. |
| Freighter popup lands off-screen | Undock the extension window before you start. |
