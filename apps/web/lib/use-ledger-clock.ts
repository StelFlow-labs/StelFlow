"use client";

import { useEffect, useRef, useState } from "react";

import { ledgerTime } from "./contract";

const RESYNC_INTERVAL_MS = 30_000;

/**
 * A local clock anchored to ledger time.
 *
 * Accrual is evaluated against the ledger's timestamp, not the browser's, so a
 * user with a skewed system clock would otherwise watch balances that disagree
 * with what a withdrawal actually pays. This samples the chain occasionally and
 * ticks locally in between, keeping the offset rather than the absolute time —
 * so the displayed second is always `browser + offset`, and a resync corrects
 * drift without the number jumping backwards on every poll.
 *
 * Returns `null` until the first sample lands, which callers should render as a
 * skeleton rather than as zero.
 */
export function useLedgerClock(): bigint | null {
  const offsetRef = useRef<bigint | null>(null);
  const [now, setNow] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;

    const browserNow = () => BigInt(Math.floor(Date.now() / 1000));

    const resync = async () => {
      try {
        const chainNow = await ledgerTime();
        if (cancelled) return;
        offsetRef.current = chainNow - browserNow();
      } catch {
        // A failed sample is not worth surfacing: the existing offset stays
        // valid, and falling back to browser time is better than a blank UI.
        offsetRef.current ??= 0n;
      }
      if (!cancelled) setNow(browserNow() + (offsetRef.current ?? 0n));
    };

    void resync();
    const resyncTimer = setInterval(resync, RESYNC_INTERVAL_MS);
    const tick = setInterval(() => {
      if (offsetRef.current !== null) setNow(browserNow() + offsetRef.current);
    }, 1_000);

    return () => {
      cancelled = true;
      clearInterval(resyncTimer);
      clearInterval(tick);
    };
  }, []);

  return now;
}
