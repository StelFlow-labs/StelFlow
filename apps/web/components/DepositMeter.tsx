/**
 * How a deposit is currently divided.
 *
 * The only real chart in the app, and its job is magnitude-of-parts against a
 * known whole, so it is a single stacked bar rather than a pie or a set of
 * gauges. Four parts that always sum to the deposit:
 *
 *   withdrawn  — already paid out and gone
 *   claimable  — accrued and available right now
 *   held       — accrued but behind a shut milestone gate
 *   remaining  — not yet streamed
 *
 * `remaining` is the track rather than a fourth series: it is the absence of
 * accrual, not a category of it, so it takes a neutral surface and no legend
 * entry of its own.
 *
 * Mark spec applied: 2px surface gaps between segments (which is also the
 * secondary encoding that keeps adjacent hues separable without relying on
 * colour), rounded ends only on the outermost segments so the bar reads as one
 * object, and a direct label under every segment. Those labels are what satisfy
 * the relief rule for light-mode aqua, which sits below 3:1 on the light
 * surface.
 */

import { formatAmount, percent } from "@/lib/format";
import type { Position } from "@/lib/stream";
import type { Stream } from "@/lib/contract";
import { depositBreakdown } from "@/lib/stream";

const SERIES = [
  { key: "withdrawn", label: "Taken", color: "var(--withdrawn)" },
  { key: "claimable", label: "Ready", color: "var(--claimable)" },
  { key: "held", label: "Held", color: "var(--held)" },
] as const;

export function DepositMeter({
  stream,
  position,
  showLegend = true,
}: {
  stream: Stream;
  position: Position;
  showLegend?: boolean;
}) {
  const parts = depositBreakdown(stream, position);
  const amounts = {
    withdrawn: stream.withdrawn,
    claimable: position.claimable,
    held: position.held,
  } as const;

  const visible = SERIES.filter(({ key }) => parts[key] > 0);

  return (
    <figure className="m-0">
      <div
        className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-surface-3"
        role="img"
        aria-label={SERIES.map(
          ({ key, label }) =>
            `${label} ${percent(parts[key])} (${formatAmount(amounts[key], { maxDecimals: 2 })})`,
        ).join(", ")}
      >
        {visible.map(({ key, label, color }) => (
          <div
            key={key}
            title={`${label}: ${formatAmount(amounts[key], { maxDecimals: 4 })}`}
            style={{
              width: `${parts[key] * 100}%`,
              background: color,
              // A width transition makes accrual read as motion rather than as
              // the bar flickering between two states each second.
              transition: "width 900ms linear",
            }}
            className="first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>

      {showLegend ? (
        <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {SERIES.map(({ key, label, color }) => (
            <span key={key} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: color }}
              />
              <span className="text-ink-3">{label}</span>
              <span className="tnum text-ink-2">
                {percent(parts[key], 0)}
              </span>
            </span>
          ))}
          {parts.remaining > 0 ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px] bg-surface-3"
              />
              {/*
                On a cancelled stream this share is not waiting to be streamed —
                it went back to the sender when accrual froze. Labelling it
                "Unstreamed" would imply money still on its way to the recipient.
              */}
              <span className="text-ink-3">
                {stream.canceled_at === undefined
                  ? "Still to come"
                  : "Back with the sender"}
              </span>
              <span className="tnum text-ink-2">
                {percent(parts.remaining, 0)}
              </span>
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
