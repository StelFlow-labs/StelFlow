"use client";

import { useMemo, useState } from "react";

import type { StreamView } from "@/lib/contract";
import { absoluteTime, formatAmount, relativeTime, shortAddress } from "@/lib/format";
import {
  MILESTONE_MET,
  ON_EXPIRY_TO_RECIPIENT,
  phaseOf,
  positionAt,
  resolveMilestone,
  settlementAt,
  type Phase,
} from "@/lib/stream";
import { DepositMeter } from "./DepositMeter";
import { Badge, Button, Card, Stat, type BadgeTone } from "./ui";

const PHASE: Record<Phase, { label: string; tone: BadgeTone }> = {
  pending: { label: "Starts soon", tone: "neutral" },
  cliff: { label: "In its cliff", tone: "warn" },
  streaming: { label: "Flowing", tone: "good" },
  completed: { label: "Finished", tone: "neutral" },
  canceled: { label: "Cancelled", tone: "bad" },
};

export function StreamCard({
  view,
  now,
  address,
  busy,
  onWithdraw,
  onApprove,
  onCancel,
}: {
  view: StreamView;
  now: bigint;
  address: string | null;
  busy: string | null;
  onWithdraw: (id: bigint) => void;
  onApprove: (id: bigint, index: number) => void;
  onCancel: (id: bigint) => void;
}) {
  const { stream } = view;
  const [open, setOpen] = useState(false);

  const position = useMemo(() => positionAt(stream, now), [stream, now]);
  const phase = phaseOf(stream, now);
  const live = stream.canceled_at === undefined;

  const isSender = address === stream.sender;
  const isRecipient = address === stream.recipient;
  const pendingApprovals = stream.milestones
    .map((milestone, index) => ({ milestone, index }))
    .filter(
      ({ milestone }) =>
        milestone.approver === address && milestone.state !== MILESTONE_MET,
    );

  const busyIs = (key: string) => busy === `${stream.id}:${key}`;

  return (
    <Card as="li" className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2.5 px-5 pt-4">
        <span className="tnum text-xs text-ink-3">#{stream.id.toString()}</span>
        <Badge tone={PHASE[phase].tone}>{PHASE[phase].label}</Badge>
        {!stream.cancelable ? (
          <Badge tone="neutral" title="Ending it early needs both signatures">
            Needs both to cancel
          </Badge>
        ) : null}
        {position.held > 0n ? (
          <Badge tone="held">Waiting on a sign-off</Badge>
        ) : null}
        {isSender || isRecipient ? (
          <span className="ml-auto text-[11px] text-ink-3">
            {isSender ? "You are paying this" : "This is paying you"}
          </span>
        ) : null}
      </div>

      <div className="grid gap-5 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="tnum text-3xl font-semibold text-ink">
              {formatAmount(position.claimable, { maxDecimals: 5 })}
            </span>
            <span className="text-sm text-ink-3">XLM ready</span>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            out of {formatAmount(stream.total, { maxDecimals: 2 })} ·{" "}
            {phase === "pending"
              ? `begins ${relativeTime(stream.start, now)}`
              : phase === "canceled"
                ? `stopped ${relativeTime(stream.canceled_at ?? stream.end, now)}`
                : phase === "completed"
                  ? `finished ${relativeTime(stream.end, now)}`
                  : `runs out ${relativeTime(stream.end, now)}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isRecipient && live && position.claimable > 0n ? (
            <Button
              variant="primary"
              size="sm"
              busy={busyIs("withdraw")}
              onClick={() => onWithdraw(stream.id)}
            >
              Withdraw
            </Button>
          ) : null}
          {pendingApprovals.slice(0, 1).map(({ index }) => (
            <Button
              key={index}
              variant="secondary"
              size="sm"
              busy={busyIs(`approve:${index}`)}
              onClick={() => onApprove(stream.id, index)}
            >
              Sign off milestone
            </Button>
          ))}
          {isSender && live ? (
            <Button
              variant="danger"
              size="sm"
              busy={busyIs("cancel")}
              onClick={() => onCancel(stream.id)}
            >
              End it
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Less" : "Details"}
          </Button>
        </div>
      </div>

      <div className="px-5 pb-5">
        <DepositMeter stream={stream} position={position} />
      </div>

      {open ? <Details view={view} now={now} position={position} /> : null}
    </Card>
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
    <div className="border-t border-edge bg-surface-0/60 px-5 py-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="Earned so far" value={formatAmount(position.streamedTotal, { maxDecimals: 4 })} />
        <Stat
          label="Already taken"
          swatch="var(--withdrawn)"
          value={formatAmount(stream.withdrawn, { maxDecimals: 4 })}
        />
        <Stat
          label="Ready now"
          swatch="var(--claimable)"
          value={formatAmount(position.claimable, { maxDecimals: 4 })}
        />
        <Stat
          label="Held back"
          swatch="var(--held)"
          value={formatAmount(position.held, { maxDecimals: 4 })}
          detail={position.held > 0n ? "waiting on a sign-off" : undefined}
        />
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <Row label="Paid by" value={shortAddress(stream.sender, 6, 6)} mono />
        <Row label="Paid to" value={shortAddress(stream.recipient, 6, 6)} mono />
        <Row label="Started" value={absoluteTime(stream.start)} />
        <Row label="Ends" value={absoluteTime(stream.end)} />
        {stream.cliff > stream.start ? (
          <Row
            label="Nothing claimable until"
            value={`${absoluteTime(stream.cliff)} (${relativeTime(stream.cliff, now)})`}
          />
        ) : null}
        {stream.canceled_at !== undefined ? (
          <Row label="Stopped" value={absoluteTime(stream.canceled_at)} />
        ) : (
          <Row
            label="If it ended now"
            value={`${formatAmount(settlement.refund, { maxDecimals: 2 })} back to the sender`}
          />
        )}
      </dl>

      {stream.milestones.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs font-medium text-ink-2">Milestones</h3>
          <ul className="mt-2.5 space-y-2">
            {stream.milestones.map((milestone, index) => {
              const resolution = resolveMilestone(milestone, now);
              const tone: BadgeTone =
                resolution === "released" ? "good" : resolution === "returned" ? "bad" : "held";
              const label =
                resolution === "released"
                  ? milestone.state === MILESTONE_MET
                    ? "Signed off"
                    : "Released by its deadline"
                  : resolution === "returned"
                    ? "Went back to the sender"
                    : "Waiting for a sign-off";

              return (
                <li
                  key={index}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge bg-surface-1 px-3.5 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="tnum text-sm text-ink">
                      {formatAmount(milestone.amount, { maxDecimals: 2 })}
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-ink-3">
                    <span className="tnum">signed by {shortAddress(milestone.approver)}</span>
                    {milestone.deadline !== 0n ? (
                      <span
                        className={resolution === "withheld" ? "text-warn" : undefined}
                        title={absoluteTime(milestone.deadline)}
                      >
                        {resolution === "withheld" ? "decides " : "deadline "}
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-edge/60 py-1.5 last:border-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className={mono ? "tnum text-ink-2" : "text-ink-2"}>{value}</dd>
    </div>
  );
}
