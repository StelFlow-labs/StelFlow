"use client";

import { useMemo, useState } from "react";

import type { StreamView } from "@/lib/contract";
import {
  absoluteTime,
  formatAmount,
  relativeTime,
  shortAddress,
} from "@/lib/format";
import {
  MILESTONE_MET,
  ON_EXPIRY_TO_RECIPIENT,
  phaseOf,
  positionAt,
  resolveMilestone,
  settlementAt,
  type Phase,
} from "@/lib/stream";
import { cn } from "@/lib/cn";
import { DepositMeter } from "./DepositMeter";
import { Badge, Button, Card, Stat, type BadgeTone } from "./ui";

const PHASE_LABEL: Record<Phase, { text: string; tone: BadgeTone }> = {
  pending: { text: "Not started", tone: "neutral" },
  cliff: { text: "In cliff", tone: "warning" },
  streaming: { text: "Streaming", tone: "good" },
  completed: { text: "Completed", tone: "neutral" },
  canceled: { text: "Cancelled", tone: "critical" },
};

export type Role = "sender" | "recipient" | "approver" | "observer";

export function StreamCard({
  view,
  now,
  address,
  onWithdraw,
  onApprove,
  onCancel,
  busy,
}: {
  view: StreamView;
  now: bigint;
  address: string | null;
  onWithdraw: (id: bigint) => void;
  onApprove: (id: bigint, index: number) => void;
  onCancel: (id: bigint) => void;
  busy: string | null;
}) {
  const { stream } = view;
  const [expanded, setExpanded] = useState(false);

  // Recomputed every tick from the same formula the contract uses, so the figure
  // rises second by second without an RPC call per second.
  const position = useMemo(() => positionAt(stream, now), [stream, now]);
  const phase = phaseOf(stream, now);
  const badge = PHASE_LABEL[phase];

  const isSender = address === stream.sender;
  const isRecipient = address === stream.recipient;
  const approverIndexes = stream.milestones
    .map((milestone, index) => ({ milestone, index }))
    .filter(({ milestone }) => milestone.approver === address);

  const live = stream.canceled_at === undefined;
  const busyKey = busy?.startsWith(`${stream.id}:`) ? busy : null;

  return (
    <Card as="li" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="tnum text-xs text-ink-muted">#{stream.id.toString()}</span>
          <Badge tone={badge.tone}>{badge.text}</Badge>
          {!stream.cancelable ? (
            <Badge tone="neutral" title="Both parties must agree to cancel">
              Non-cancelable
            </Badge>
          ) : null}
          {position.held > 0n ? (
            <Badge tone="held">
              {stream.milestones.filter(
                (m) => resolveMilestone(m, now) === "withheld",
              ).length}{" "}
              gate(s) shut
            </Badge>
          ) : null}
        </div>
        <RoleTag isSender={isSender} isRecipient={isRecipient} />
      </div>

      <div className="grid gap-5 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="tnum text-2xl font-medium text-ink tabular-nums">
              {formatAmount(position.claimable, { maxDecimals: 5 })}
            </span>
            <span className="text-xs text-ink-muted">claimable now</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            of {formatAmount(stream.total, { maxDecimals: 2 })} deposited ·{" "}
            {phase === "pending"
              ? `starts ${relativeTime(stream.start, now)}`
              : phase === "completed" || phase === "canceled"
                ? `ended ${relativeTime(stream.end, now)}`
                : `ends ${relativeTime(stream.end, now)}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isRecipient && live && position.claimable > 0n ? (
            <Button
              variant="primary"
              busy={busyKey === `${stream.id}:withdraw`}
              onClick={() => onWithdraw(stream.id)}
            >
              Withdraw
            </Button>
          ) : null}
          {approverIndexes
            .filter(({ milestone }) => milestone.state !== MILESTONE_MET)
            .slice(0, 1)
            .map(({ index }) => (
              <Button
                key={index}
                variant="secondary"
                busy={busyKey === `${stream.id}:approve:${index}`}
                onClick={() => onApprove(stream.id, index)}
              >
                Approve milestone
              </Button>
            ))}
          {isSender && live ? (
            <Button
              variant="danger"
              busy={busyKey === `${stream.id}:cancel`}
              onClick={() => onCancel(stream.id)}
            >
              Cancel
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setExpanded((open) => !open)}>
            {expanded ? "Less" : "Details"}
          </Button>
        </div>
      </div>

      <div className="px-5 pb-4">
        <DepositMeter stream={stream} position={position} />
      </div>

      {expanded ? (
        <Details view={view} now={now} position={position} />
      ) : null}
    </Card>
  );
}

function RoleTag({
  isSender,
  isRecipient,
}: {
  isSender: boolean;
  isRecipient: boolean;
}) {
  if (!isSender && !isRecipient) return null;
  return (
    <span className="text-[11px] text-ink-muted">
      You are the {isSender ? "sender" : "recipient"}
    </span>
  );
}

function Details({
  view,
  now,
  position,
}: {
  view: StreamView;
  now: bigint;
  position: ReturnType<typeof positionAt>;
}) {
  const { stream } = view;
  const settlement = settlementAt(stream, now);

  return (
    <div className="border-t border-edge bg-surface-0/60 px-5 py-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat
          label="Streamed"
          value={formatAmount(position.streamedTotal, { maxDecimals: 4 })}
        />
        <Stat
          label="Withdrawn"
          swatch="var(--series-withdrawn)"
          value={formatAmount(stream.withdrawn, { maxDecimals: 4 })}
        />
        <Stat
          label="Claimable"
          swatch="var(--series-claimable)"
          value={formatAmount(position.claimable, { maxDecimals: 4 })}
        />
        <Stat
          label="Held"
          swatch="var(--series-held)"
          value={formatAmount(position.held, { maxDecimals: 4 })}
          detail={position.held > 0n ? "behind a shut gate" : undefined}
        />
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <Row label="Sender" value={shortAddress(stream.sender, 6, 6)} mono />
        <Row label="Recipient" value={shortAddress(stream.recipient, 6, 6)} mono />
        <Row label="Starts" value={absoluteTime(stream.start)} />
        <Row label="Ends" value={absoluteTime(stream.end)} />
        {stream.cliff > stream.start ? (
          <Row
            label="Cliff"
            value={`${absoluteTime(stream.cliff)} (${relativeTime(stream.cliff, now)})`}
          />
        ) : null}
        {stream.canceled_at !== undefined ? (
          <Row label="Cancelled" value={absoluteTime(stream.canceled_at)} />
        ) : (
          <Row
            label="If cancelled now"
            value={`${formatAmount(settlement.refund, { maxDecimals: 2 })} back to sender`}
          />
        )}
      </dl>

      {stream.milestones.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-xs font-medium text-ink-secondary">Milestones</h3>
          <ul className="mt-2 space-y-2">
            {stream.milestones.map((milestone, index) => {
              const resolution = resolveMilestone(milestone, now);
              const expiring = milestone.deadline !== 0n;
              return (
                <li
                  key={index}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge bg-surface-1 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="tnum text-xs text-ink-muted">{index}</span>
                    <span className="tnum text-sm text-ink">
                      {formatAmount(milestone.amount, { maxDecimals: 2 })}
                    </span>
                    <Badge
                      tone={
                        resolution === "released"
                          ? "good"
                          : resolution === "returned"
                            ? "critical"
                            : "held"
                      }
                    >
                      {resolution === "released"
                        ? milestone.state === MILESTONE_MET
                          ? "Approved"
                          : "Released by deadline"
                        : resolution === "returned"
                          ? "Returned to sender"
                          : "Awaiting approval"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                    <span className="tnum">
                      approver {shortAddress(milestone.approver)}
                    </span>
                    {expiring ? (
                      <span
                        className={cn(
                          resolution === "withheld" && "text-[var(--status-warning)]",
                        )}
                        title={absoluteTime(milestone.deadline)}
                      >
                        {resolution === "withheld" ? "resolves " : "deadline "}
                        {relativeTime(milestone.deadline, now)} →{" "}
                        {milestone.on_expiry === ON_EXPIRY_TO_RECIPIENT
                          ? "recipient"
                          : "sender"}
                      </span>
                    ) : (
                      <span>no deadline</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-edge/60 py-1 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn("text-ink-secondary", mono && "tnum")}>{value}</dd>
    </div>
  );
}
