"use client";

import { useEffect, useState } from "react";

const SALARY_PER_SECOND = 0.0011574; // £100/day, roughly

/**
 * The hero's proof: a number that goes up while you read the sentence beside it.
 * Purely illustrative — it is not reading the chain — so it never shows an
 * amount a visitor could mistake for their own balance.
 */
export function LiveStreamDemo() {
  // Starts at zero on both server and client, so there is nothing to mismatch
  // during hydration and no readiness flag to track.
  const [earned, setEarned] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => {
      setEarned(((Date.now() - started) / 1000) * SALARY_PER_SECOND);
    }, 50);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-surface-1 p-6 shadow-[var(--glow)] sm:p-8">
      <div
        aria-hidden
        className="stream-lines pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
      />

      <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">
        Since you opened this page
      </p>

      <p className="mt-3 flex items-baseline gap-2">
        <span className="tnum text-4xl font-semibold text-ink sm:text-5xl">
          {earned.toFixed(6)}
        </span>
        <span className="text-sm text-ink-3">XLM</span>
      </p>

      <p className="mt-4 text-sm leading-relaxed text-ink-2">
        That is what a stream looks like from the inside. Nobody pressed send, no
        scheduled job woke up, and no one approved anything. The balance simply
        rises because time does.
      </p>

      <div className="mt-6 flex items-center gap-3 border-t border-edge pt-5">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-claimable opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-claimable" />
        </span>
        <span className="text-xs text-ink-3">
          Yours to withdraw at any moment — not at month end
        </span>
      </div>
    </div>
  );
}
