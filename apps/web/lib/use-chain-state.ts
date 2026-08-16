"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchPausedUntil, fetchStreams, type StreamView } from "./contract";
import { fetchActivity, type Activity } from "./events";

const POLL_INTERVAL_MS = 15_000;

export interface ChainState {
  streams: StreamView[];
  activity: Activity[];
  pausedUntil: bigint;
  loading: boolean;
  /** Re-read immediately — call after a write lands. */
  refresh: () => Promise<void>;
}

/**
 * Everything this app reads from the chain, polled.
 *
 * Polling is only about picking up *other people's* transactions. Accrual
 * between polls is projected locally from the ledger clock using the contract's
 * own formula, so a slow interval here costs nothing visually — see
 * `lib/stream.ts`.
 *
 * Each source settles independently: RPC's `getEvents` is the flakiest of the
 * three, and a failed activity read should not blank the stream list.
 */
export function useChainState(): ChainState {
  const [streams, setStreams] = useState<StreamView[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [pausedUntil, setPausedUntil] = useState(0n);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [nextStreams, nextActivity, nextPaused] = await Promise.allSettled([
        fetchStreams(),
        fetchActivity(),
        fetchPausedUntil(),
      ]);
      if (cancelled) return;

      if (nextStreams.status === "fulfilled") setStreams(nextStreams.value);
      if (nextActivity.status === "fulfilled") setActivity(nextActivity.value);
      if (nextPaused.status === "fulfilled") setPausedUntil(nextPaused.value);
      setLoading(false);
    };

    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [nonce]);

  const refresh = useCallback(async () => {
    setNonce((value) => value + 1);
  }, []);

  return { streams, activity, pausedUntil, loading, refresh };
}
