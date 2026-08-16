"use client";

import { useCallback, useMemo, useState } from "react";

import { ActivityFeed } from "@/components/ActivityFeed";
import { CreateStreamForm } from "@/components/CreateStreamForm";
import { Header } from "@/components/Header";
import { StreamCard } from "@/components/StreamCard";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui";
import { useWallet } from "@/components/WalletProvider";
import * as actions from "@/lib/actions";
import { formatAmount } from "@/lib/format";
import { positionAt } from "@/lib/stream";
import { useChainState } from "@/lib/use-chain-state";
import { useLedgerClock } from "@/lib/use-ledger-clock";

type Filter = "all" | "mine";

export default function Dashboard() {
  const { address } = useWallet();
  const now = useLedgerClock();

  const { streams, activity, pausedUntil, loading, refresh } = useChainState();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);
  const [filter, setFilter] = useState<Filter>("all");

  /** Run a write, then refresh. One place for the busy flag and error surfacing. */
  const run = useCallback(
    async (key: string, work: () => Promise<string>) => {
      setBusy(key);
      setNotice(null);
      try {
        const text = await work();
        setNotice({ kind: "ok", text });
        await refresh();
      } catch (cause) {
        setNotice({
          kind: "error",
          text: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const visible = useMemo(() => {
    if (filter === "mine" && address) {
      return streams.filter(
        ({ stream }) =>
          stream.sender === address ||
          stream.recipient === address ||
          stream.milestones.some((m) => m.approver === address),
      );
    }
    return streams;
  }, [streams, filter, address]);

  const totals = useMemo(() => {
    if (!now) return null;
    return streams.reduce(
      (accumulator, { stream }) => {
        const position = positionAt(stream, now);
        return {
          escrowed: accumulator.escrowed + stream.total,
          claimable: accumulator.claimable + position.claimable,
          held: accumulator.held + position.held,
        };
      },
      { escrowed: 0n, claimable: 0n, held: 0n },
    );
  }, [streams, now]);

  const paused = now !== null && pausedUntil > now;

  return (
    <div className="min-h-dvh">
      <Header paused={paused} />

      <main className="mx-auto max-w-6xl px-5 py-6">
        <section className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Payment streaming with milestone gates
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-secondary">
            Money moves continuously as the ledger clock advances. Part of a
            stream can sit behind a gate that accrues on schedule but stays
            unclaimable until a named approver opens it.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-ink-muted">
            Running on Stellar testnet with no audit. The contract has no upgrade
            function and no admin over funds — the one global role can stop new
            streams being created and nothing else.
          </p>
        </section>

        {totals && streams.length > 0 ? (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Summary label="Streams" value={streams.length.toString()} />
            <Summary
              label="Escrowed"
              value={formatAmount(totals.escrowed, { maxDecimals: 2 })}
              unit="XLM"
            />
            <Summary
              label="Claimable now"
              value={formatAmount(totals.claimable, { maxDecimals: 2 })}
              unit="XLM"
              swatch="var(--series-claimable)"
            />
            <Summary
              label="Behind gates"
              value={formatAmount(totals.held, { maxDecimals: 2 })}
              unit="XLM"
              swatch="var(--series-held)"
            />
          </div>
        ) : null}

        {notice ? (
          <p
            role="status"
            className={
              notice.kind === "ok"
                ? "mb-5 rounded-lg border border-[var(--status-good)]/30 bg-[var(--status-good)]/10 px-3 py-2 text-xs text-[var(--status-good)]"
                : "mb-5 rounded-lg border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/10 px-3 py-2 text-xs text-[var(--status-critical)]"
            }
          >
            {notice.text}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-ink">
                Streams
              </h2>
              {address ? (
                <div className="flex gap-1 rounded-lg border border-edge bg-surface-1 p-0.5">
                  {(["all", "mine"] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => setFilter(option)}
                      className={
                        filter === option
                          ? "rounded-md bg-surface-3 px-2.5 py-1 text-xs font-medium text-ink"
                          : "rounded-md px-2.5 py-1 text-xs text-ink-muted hover:text-ink-secondary"
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
                {[0, 1].map((row) => (
                  <Skeleton key={row} className="h-44 w-full rounded-xl" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <Card>
                <EmptyState
                  title={
                    filter === "mine"
                      ? "No streams involve your address"
                      : "No streams yet"
                  }
                >
                  {filter === "mine"
                    ? "Switch to All to see everything on this contract."
                    : "Connect a wallet and create the first one."}
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
                        return `Withdrew ${formatAmount(paid, { maxDecimals: 4 })} XLM.`;
                      })
                    }
                    onApprove={(id, index) =>
                      void run(`${id}:approve:${index}`, async () => {
                        await actions.approveMilestone(id, index, address!);
                        return "Milestone approved. The tranche it held is now claimable.";
                      })
                    }
                    onCancel={(id) =>
                      void run(`${id}:cancel`, async () => {
                        const settlement = await actions.cancelStream(id, address!);
                        return `Cancelled. ${formatAmount(settlement.refund, { maxDecimals: 4 })} XLM returned to the sender; ${formatAmount(settlement.recipient_balance, { maxDecimals: 4 })} XLM stays claimable by the recipient.`;
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </div>

          <aside className="space-y-4">
            {address && now ? (
              paused ? (
                <Card>
                  <CardHeader
                    title="Creation is paused"
                    hint="Existing streams are unaffected — withdrawals, approvals and cancellations all still work."
                  />
                  <div className="px-5 py-4">
                    <Badge tone="critical">
                      Lifts automatically, no transaction needed
                    </Badge>
                  </div>
                </Card>
              ) : (
                <CreateStreamForm
                  sender={address}
                  now={now}
                  busy={busy === "create"}
                  onSubmit={(input) =>
                    void run("create", async () => {
                      const id = await actions.createStream({
                        ...input,
                        sender: address,
                      });
                      return `Stream #${id} created and funded.`;
                    })
                  }
                />
              )
            ) : (
              <Card>
                <CardHeader
                  title="Create a stream"
                  hint="Connect a wallet to fund one."
                />
                <EmptyState title="Wallet not connected">
                  Streams are browsable without one. Creating, withdrawing,
                  approving and cancelling all need a signature.
                </EmptyState>
              </Card>
            )}

            <ActivityFeed
              activity={activity}
              now={now ?? 0n}
              loading={loading}
            />
          </aside>
        </div>

        <footer className="mt-10 border-t border-edge pt-5 text-xs text-ink-muted">
          <p>
            Reads come straight from RPC — there is no indexer behind this yet, so
            the activity feed shows only what RPC still retains. Balances between
            polls are projected locally using the contract&rsquo;s own formula and
            re-synced against ledger time.
          </p>
        </footer>
      </main>
    </div>
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
    <Card className="px-4 py-3">
      <div className="flex items-center gap-1.5">
        {swatch ? (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: swatch }}
          />
        ) : null}
        <span className="text-xs text-ink-muted">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tnum text-lg font-medium text-ink">{value}</span>
        {unit ? <span className="text-xs text-ink-muted">{unit}</span> : null}
      </div>
    </Card>
  );
}
