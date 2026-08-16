"use client";

import { useCallback, useMemo, useState } from "react";

import { ActivityFeed } from "@/components/ActivityFeed";
import { CreateStreamForm, type StreamDraft } from "@/components/CreateStreamForm";
import { SiteHeader } from "@/components/SiteHeader";
import { StreamCard } from "@/components/StreamCard";
import { useWallet } from "@/components/WalletProvider";
import { Alert, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui";
import * as actions from "@/lib/actions";
import { TESTNET } from "@/lib/contract";
import { formatAmount, shortAddress } from "@/lib/format";
import { positionAt } from "@/lib/stream";
import { useChainState } from "@/lib/use-chain-state";
import { useLedgerClock } from "@/lib/use-ledger-clock";

type Filter = "all" | "mine";

export default function Dashboard() {
  const { address } = useWallet();
  const now = useLedgerClock();
  const { streams, activity, pausedUntil, loading, refresh } = useChainState();

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const run = useCallback(
    async (key: string, work: () => Promise<string>) => {
      setBusy(key);
      setNotice(null);
      try {
        setNotice({ tone: "good", text: await work() });
        await refresh();
      } catch (cause) {
        setNotice({
          tone: "bad",
          text: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const visible = useMemo(() => {
    if (filter !== "mine" || !address) return streams;
    return streams.filter(
      ({ stream }) =>
        stream.sender === address ||
        stream.recipient === address ||
        stream.milestones.some((m) => m.approver === address),
    );
  }, [streams, filter, address]);

  const totals = useMemo(() => {
    if (!now) return null;
    return streams.reduce(
      (acc, { stream }) => {
        const position = positionAt(stream, now);
        return {
          escrowed: acc.escrowed + stream.total,
          claimable: acc.claimable + position.claimable,
          held: acc.held + position.held,
        };
      },
      { escrowed: 0n, claimable: 0n, held: 0n },
    );
  }, [streams, now]);

  const paused = now !== null && pausedUntil > now;

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Your streams</h1>
            <p className="mt-1.5 text-sm text-ink-2">
              Balances update every second. Nothing here uses real money.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="warn">Testnet</Badge>
            {paused ? <Badge tone="bad">New streams paused</Badge> : null}
            <a
              href={TESTNET.explorer}
              target="_blank"
              rel="noreferrer"
              className="tnum text-xs text-ink-3 underline-offset-4 hover:text-ink-2 hover:underline"
            >
              {shortAddress(TESTNET.contractId, 4, 4)}
            </a>
          </div>
        </div>

        {!address ? <GetStarted /> : null}

        {totals && streams.length > 0 ? (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Summary label="Streams" value={streams.length.toString()} />
            <Summary label="Locked in" value={formatAmount(totals.escrowed, { maxDecimals: 2 })} unit="XLM" />
            <Summary
              label="Ready to take"
              value={formatAmount(totals.claimable, { maxDecimals: 2 })}
              unit="XLM"
              swatch="var(--claimable)"
            />
            <Summary
              label="Awaiting sign-off"
              value={formatAmount(totals.held, { maxDecimals: 2 })}
              unit="XLM"
              swatch="var(--held)"
            />
          </div>
        ) : null}

        {notice ? (
          <div className="mb-5">
            <Alert tone={notice.tone}>{notice.text}</Alert>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">
                {filter === "mine" ? "Streams you are part of" : "Everything on this contract"}
              </h2>
              {address ? (
                <div className="flex gap-1 rounded-xl border border-edge bg-surface-1 p-1">
                  {(["all", "mine"] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => setFilter(option)}
                      className={
                        filter === option
                          ? "rounded-lg bg-surface-3 px-3 py-1 text-xs font-medium text-ink"
                          : "rounded-lg px-3 py-1 text-xs text-ink-3 hover:text-ink-2"
                      }
                    >
                      {option === "all" ? "All" : "Mine"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {loading || !now ? (
              <div className="space-y-4">
                <Skeleton className="h-48 w-full rounded-2xl" />
                <Skeleton className="h-48 w-full rounded-2xl" />
              </div>
            ) : visible.length === 0 ? (
              <Card>
                <EmptyState title={filter === "mine" ? "None of these involve you yet" : "No streams yet"}>
                  {filter === "mine"
                    ? "Switch to All to see what other people have created here."
                    : "Create the first one and watch it fill up."}
                </EmptyState>
              </Card>
            ) : (
              <ul className="space-y-4">
                {visible.map((view) => (
                  <StreamCard
                    key={view.stream.id.toString()}
                    view={view}
                    now={now}
                    address={address}
                    busy={busy}
                    onWithdraw={(id) =>
                      void run(`${id}:withdraw`, async () => {
                        const paid = await actions.withdraw(id, address!);
                        return `Sent ${formatAmount(paid, { maxDecimals: 4 })} XLM to your wallet.`;
                      })
                    }
                    onApprove={(id, index) =>
                      void run(`${id}:approve:${index}`, async () => {
                        await actions.approveMilestone(id, index, address!);
                        return "Signed off. Everything that milestone was holding is now available.";
                      })
                    }
                    onCancel={(id) =>
                      void run(`${id}:cancel`, async () => {
                        const s = await actions.cancelStream(id, address!);
                        return `Stopped. ${formatAmount(s.refund, { maxDecimals: 4 })} XLM came back to you; ${formatAmount(s.recipient_balance, { maxDecimals: 4 })} XLM stays with the recipient.`;
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-4">
            {address && now ? (
              paused ? (
                <Card>
                  <CardHeader
                    title="New streams are paused"
                    hint="Every stream that already exists carries on exactly as before — withdrawing, signing off and cancelling all still work."
                  />
                  <div className="px-5 py-4">
                    <Badge tone="warn">Lifts on its own, with no transaction needed</Badge>
                  </div>
                </Card>
              ) : (
                <CreateStreamForm
                  sender={address}
                  now={now}
                  busy={busy === "create"}
                  onSubmit={(draft: StreamDraft) =>
                    void run("create", async () => {
                      const id = await actions.createStream({ ...draft, sender: address });
                      return `Stream #${id} is live and already flowing.`;
                    })
                  }
                />
              )
            ) : (
              <Card>
                <CardHeader title="Start a stream" hint="Connect a wallet to fund one." />
                <EmptyState title="No wallet connected">
                  You can look around without one. Creating, withdrawing, signing
                  off and cancelling each need a signature.
                </EmptyState>
              </Card>
            )}

            <ActivityFeed activity={activity} now={now ?? 0n} loading={loading} />
          </aside>
        </div>
      </main>
    </div>
  );
}

function GetStarted() {
  const steps = [
    {
      title: "Install Freighter",
      body: "The Stellar wallet that works best with this. It is a browser extension and takes about a minute.",
      href: "https://www.freighter.app/",
      cta: "Get Freighter",
    },
    {
      title: "Switch it to Testnet",
      body: "Open Freighter, go to the network dropdown at the top, and choose Test Net. Real funds are never involved.",
    },
    {
      title: "Grab some test XLM",
      body: "The faucet tops up any testnet account with 10,000 XLM, free and instantly.",
      href: "https://friendbot.stellar.org",
      cta: "Open the faucet",
    },
  ];

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader
        title="First time here?"
        hint="Three quick things and you can send yourself a stream that finishes while you watch."
      />
      <ol className="grid divide-y divide-edge sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {steps.map((step, index) => (
          <li key={step.title} className="p-5">
            <span className="tnum text-xs font-medium text-brand">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-2 text-sm font-semibold text-ink">{step.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{step.body}</p>
            {step.href ? (
              <a
                href={step.href}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs font-medium text-brand underline-offset-4 hover:underline"
              >
                {step.cta} →
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Summary({
  label,
  value,
  unit,
  swatch,
}: {
  label: string;
  value: string;
  unit?: string;
  swatch?: string;
}) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        {swatch ? (
          <span aria-hidden className="size-2 shrink-0 rounded-[3px]" style={{ background: swatch }} />
        ) : null}
        <span className="text-xs text-ink-3">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tnum text-xl font-semibold text-ink">{value}</span>
        {unit ? <span className="text-xs text-ink-3">{unit}</span> : null}
      </div>
    </Card>
  );
}
