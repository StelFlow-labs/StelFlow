import Link from "next/link";

import { Mark } from "@/components/brand";
import { GateDiagram } from "@/components/landing/GateDiagram";
import { LiveStreamDemo } from "@/components/landing/LiveStreamDemo";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge, Card, buttonClasses } from "@/components/ui";

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Gates />
        <BuiltFor />
        <Promises />
        <Questions />
        <CallToAction />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-edge">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--brand-soft),transparent_60%)] opacity-70"
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-28">
        <div className="rise">
          <Badge tone="brand">Live on Stellar testnet</Badge>

          <h1 className="mt-6 text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-ink sm:text-5xl lg:text-6xl">
            Get paid by the second, not by the month.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
            StelFlow turns a payment into a steady flow. You deposit once, and
            the person on the other side watches their balance rise in real time
            — and can take what they have earned whenever they need it.
          </p>

          <p className="mt-4 max-w-xl leading-relaxed text-ink-3">
            When some of the work needs signing off first, you can hold part of
            it behind a milestone. It keeps growing on the same clock; it just
            waits for a yes before it can be withdrawn.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/app" className={buttonClasses("primary", "lg")}>
              Open the app
            </Link>
            <Link href="#how" className={buttonClasses("secondary", "lg")}>
              See how it works
            </Link>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-ink-3">
            Free to try with test funds. No sign-up, no email, and nothing to
            install beyond a Stellar wallet.
          </p>
        </div>

        <div className="rise [animation-delay:120ms]">
          <LiveStreamDemo />
        </div>
      </div>
    </section>
  );
}

function Problem() {
  const pains = [
    {
      title: "Waiting is the default",
      body: "You did the work in week one and get paid in week five. In between, the money exists — it is simply sitting somewhere else.",
    },
    {
      title: "Someone has to remember",
      body: "Recurring payments depend on a person signing on time, every time. When they are away, or gone, the payments stop.",
    },
    {
      title: "All-or-nothing escrow",
      body: "Lock everything until the work is done and the person doing it has to fund themselves in the meantime. Small teams fail here for reasons that have nothing to do with their work.",
    },
  ];

  return (
    <section className="border-b border-edge">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance text-ink">
          Paying people over time is still awkward, and everyone has quietly
          accepted it.
        </h2>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {pains.map((pain) => (
            <Card key={pain.title} className="p-6">
              <h3 className="text-sm font-semibold text-ink">{pain.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-2">{pain.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Deposit once",
      body: "You choose who gets paid, how much, and over what period. The full amount moves into the contract there and then — which is exactly what makes the promise real.",
    },
    {
      n: "02",
      title: "The balance rises on its own",
      body: "Nothing runs on a schedule and nobody presses anything. The amount they have earned is worked out from the clock, every time anyone looks.",
    },
    {
      n: "03",
      title: "They withdraw whenever",
      body: "Daily, monthly, or once at the end — it makes no difference to the total. They take what has built up, and the rest keeps flowing.",
    },
  ];

  return (
    <section id="how" className="scroll-mt-20 border-b border-edge bg-surface-1">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight text-ink">
          Three steps, and then it looks after itself.
        </h2>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.n} className="relative">
              <span className="tnum text-xs font-medium text-brand">{step.n}</span>
              <h3 className="mt-3 text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-2.5 leading-relaxed text-ink-2">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Gates() {
  return (
    <section id="gates" className="scroll-mt-20 border-b border-edge">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <Badge tone="held">What makes this different</Badge>
          <h2 className="mt-5 text-3xl leading-tight font-semibold tracking-tight text-balance text-ink">
            Some money should wait for a yes. It should not have to wait to
            start growing.
          </h2>
          <p className="mt-5 leading-relaxed text-ink-2">
            Most real payments are not purely about time. A grant depends on
            delivery. A bonus depends on a target. The usual answer is to hold
            that money back entirely until someone signs — which punishes the
            person doing the work for how quickly the reviewer replies.
          </p>
          <p className="mt-4 leading-relaxed text-ink-2">
            A milestone gate separates the two. The money accrues from day one on
            the ordinary clock, and it simply cannot be withdrawn until the
            person you named says yes. When they do, everything it has been
            holding is released at once.
          </p>
          <p className="mt-4 leading-relaxed text-ink-3">
            Try it — the gate below is real, and you can open it.
          </p>
        </div>

        <GateDiagram />
      </div>
    </section>
  );
}

function BuiltFor() {
  const cases = [
    {
      title: "Paying a team",
      lede: "Contributors who join and leave mid-month",
      body: "Everyone draws their own pay when they need it, so nobody waits on a treasury signer. When someone leaves on the 3rd, the maths has already handled it — they keep three days, the rest comes back.",
      href: "https://github.com/StelFlow-labs/StelFlow/blob/main/docs/use-case-dao-payroll.md",
    },
    {
      title: "Funding work in stages",
      lede: "Grants with deliverables to review",
      body: "A steady half keeps the team fed while they build. The reviewed half fills up alongside it and unlocks when the committee signs — so a slow review delays the money without starving anyone.",
      href: "https://github.com/StelFlow-labs/StelFlow/blob/main/docs/use-case-grant-disbursement.md",
    },
    {
      title: "Vesting over years",
      lede: "Long grants with a cliff",
      body: "Nothing can be taken for the first year, then the whole first year arrives at once and the rest keeps flowing. The person vesting can watch it happen rather than take someone's word for it.",
      href: "https://github.com/StelFlow-labs/StelFlow/blob/main/docs/use-case-vesting.md",
    },
  ];

  return (
    <section className="border-b border-edge bg-surface-1">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight text-ink">
          Built for three jobs in particular.
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-ink-2">
          Each one is a case where a single lump sum is too blunt and a recurring
          transfer is too fragile.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {cases.map((item) => (
            <Card key={item.title} className="flex flex-col p-6">
              <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
              <p className="mt-1 text-xs font-medium text-brand">{item.lede}</p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-2">{item.body}</p>
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="mt-5 text-xs font-medium text-ink-2 underline-offset-4 hover:text-brand hover:underline"
              >
                Read the detail →
              </a>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Promises() {
  const promises = [
    {
      title: "Nobody can change the rules later",
      body: "The contract has no upgrade button — not a locked one, not a governed one. It cannot be rewritten by us or by anyone else. What it does today is what it will do for as long as it exists.",
    },
    {
      title: "No one holds a key to your money",
      body: "There is no administrator who can move, freeze, redirect or reverse a stream. The only powers that exist belong to the people named on it, and each one is limited to a single action.",
    },
    {
      title: "Withdrawals can never be blocked",
      body: "There is an emergency switch, and all it can do is stop brand-new streams being created. It cannot touch a stream that already exists, it expires by itself, and it can be given up for good.",
    },
    {
      title: "Approving is not custody",
      body: "A reviewer flips one switch, once, in one direction. They cannot take the money, send it elsewhere, or close the gate again once it is open.",
    },
  ];

  return (
    <section id="trust" className="scroll-mt-20 border-b border-edge">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="max-w-3xl text-3xl leading-tight font-semibold tracking-tight text-balance text-ink">
          The interesting part is what StelFlow deliberately cannot do.
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-ink-2">
          Most of the design work went into removing powers rather than adding
          features. Every one of these is a capability we chose not to have.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {promises.map((promise) => (
            <div key={promise.title} className="flex gap-4">
              <Mark className="mt-1 size-5 shrink-0 text-brand" />
              <div>
                <h3 className="text-sm font-semibold text-ink">{promise.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{promise.body}</p>
              </div>
            </div>
          ))}
        </div>

        <Card className="mt-12 border-warn/30 bg-warn/5 p-6">
          <h3 className="text-sm font-semibold text-warn">
            And the part we would rather you heard from us
          </h3>
          <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-ink-2">
            StelFlow has not been audited, and it is running on a test network
            with play money. Because the contract can never be changed, a bug
            found later could not be patched — which raises the stakes on that
            audit rather than lowering them. Please do not put anything you care
            about into it yet. When that changes, this paragraph will change with
            it.
          </p>
          <a
            href="https://github.com/StelFlow-labs/StelFlow/blob/main/docs/threat-model.md"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-xs font-medium text-warn underline-offset-4 hover:underline"
          >
            Read the threat model, including the risks we have accepted →
          </a>
        </Card>
      </div>
    </section>
  );
}

function Questions() {
  const faqs = [
    {
      q: "Does withdrawing more often cost me more?",
      a: "You pay a small network fee each time, so more withdrawals cost a little more in fees. The amount you end up with is identical either way — the maths does not care how often you settle.",
    },
    {
      q: "What if I never withdraw?",
      a: "Nothing is lost. Your balance keeps rising on its own, and it waits for you. Withdrawing is simply moving what is already yours.",
    },
    {
      q: "Can the sender take back what I have earned?",
      a: "No. If they cancel, the clock stops and everything you have earned up to that moment stays yours to withdraw. Only the part that had not yet reached you goes back.",
    },
    {
      q: "What if the reviewer never signs?",
      a: "The steady part of your stream is unaffected and keeps paying. For the gated part, whoever sets up the stream can add a deadline and decide up front where the money goes if it passes — and both of you can see that choice before either signs.",
    },
    {
      q: "What can I stream?",
      a: "Any Stellar asset, including USDC. The demo uses test XLM so it costs you nothing to try.",
    },
    {
      q: "Do I need to trust you?",
      a: "Less than you might expect, and that is the point. We cannot upgrade the contract, cannot move your funds, and cannot stop you withdrawing. What we can do is stop new streams being created — and even that expires on its own.",
    },
  ];

  return (
    <section className="border-b border-edge bg-surface-1">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight text-ink">
          Questions people actually ask.
        </h2>

        <dl className="mt-10 divide-y divide-edge">
          {faqs.map((faq) => (
            <div key={faq.q} className="py-5">
              <dt className="text-sm font-semibold text-ink">{faq.q}</dt>
              <dd className="mt-2 leading-relaxed text-ink-2">{faq.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--brand-soft),transparent_65%)]"
      />
      <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance text-ink sm:text-4xl">
          Start a stream in about two minutes.
        </h2>
        <p className="mx-auto mt-5 max-w-xl leading-relaxed text-ink-2">
          Connect a Stellar wallet, get free test funds from the faucet, and send
          yourself a stream that finishes while you watch it. Nothing here costs
          real money.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/app" className={buttonClasses("primary", "lg")}>
            Open the app
          </Link>
          <a
            href="https://github.com/StelFlow-labs/StelFlow/blob/main/TESTING.md"
            target="_blank"
            rel="noreferrer"
            className={buttonClasses("secondary", "lg")}
          >
            Follow the walkthrough
          </a>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-edge">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-ink-3">
            StelFlow · payment streaming with milestone gates, on Stellar
          </p>
          <p className="mt-1 text-xs text-ink-3">
            Apache-2.0 · testnet only · unaudited
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          {[
            ["GitHub", "https://github.com/StelFlow-labs/StelFlow"],
            ["Docs", "https://github.com/StelFlow-labs/StelFlow/tree/main/docs"],
            [
              "Security",
              "https://github.com/StelFlow-labs/StelFlow/blob/main/docs/SECURITY.md",
            ],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-ink-3 underline-offset-4 hover:text-ink hover:underline"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
