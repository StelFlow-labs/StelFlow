"use client";

import { useState } from "react";

import { Button } from "@/components/ui";

/**
 * The milestone gate, made tangible: the visitor opens the gate themselves and
 * watches the held portion become claimable. Explaining this in prose has never
 * worked as well as letting someone press the button.
 */
export function GateDiagram() {
  const [approved, setApproved] = useState(false);

  return (
    <div className="rounded-2xl border border-edge bg-surface-1 p-6 shadow-[var(--glow)] sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">A four-month grant</p>
          <p className="mt-1 text-xs text-ink-3">
            £12,000 total · half paid steadily, half waiting on a review
          </p>
        </div>
        <Button
          size="sm"
          variant={approved ? "secondary" : "primary"}
          onClick={() => setApproved((open) => !open)}
        >
          {approved ? "Close the gate again" : "Approve the milestone"}
        </Button>
      </div>

      <div className="mt-7 space-y-6">
        <Tranche
          label="Steady half"
          caption="Arrives every second from day one, whatever anyone decides."
          fillClass="bg-claimable"
          fill={62}
          status="Yours already"
          statusClass="text-claimable"
        />

        <Tranche
          label="Reviewed half"
          caption={
            approved
              ? "The reviewer signed. Everything it had been holding since day one is yours — all at once, not from today."
              : "Filling up on exactly the same clock, but locked until a named reviewer signs."
          }
          fillClass={approved ? "bg-claimable" : "bg-held"}
          fill={62}
          gated={!approved}
          status={approved ? "Released to you" : "Held, still growing"}
          statusClass={approved ? "text-claimable" : "text-held"}
        />
      </div>

      <p className="mt-7 border-t border-edge pt-5 text-xs leading-relaxed text-ink-3">
        The reviewer can only ever open the gate. They cannot redirect the money,
        take it, slow it down, or reach the steady half — and once they have
        opened it, it stays open.
      </p>
    </div>
  );
}

function Tranche({
  label,
  caption,
  fill,
  fillClass,
  gated,
  status,
  statusClass,
}: {
  label: string;
  caption: string;
  fill: number;
  fillClass: string;
  gated?: boolean;
  status: string;
  statusClass: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className={`text-[11px] font-medium ${statusClass}`}>{status}</span>
      </div>

      <div className="relative h-3 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ${fillClass}`}
          style={{ width: `${fill}%` }}
        />
        {gated ? (
          <div
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-surface-1"
            style={{ left: `${fill}%` }}
          />
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-3">{caption}</p>
    </div>
  );
}
