"use client";

import { CONTRACT_ID, TESTNET } from "@/lib/contract";
import { shortAddress } from "@/lib/format";
import { useWallet } from "./WalletProvider";
import { Badge, Button } from "./ui";

/**
 * The mark, drawn inline rather than fetched.
 *
 * Three streams with the middle one interrupted by a gate — the protocol's
 * actual mechanism, and the top and bottom rules passing through uninterrupted
 * is the design's real claim: a gate holds its own tranche and reaches nothing
 * else. `currentColor` throughout, so it needs no second asset for dark mode.
 */
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        strokeLinecap="round"
      >
        <path d="M10 18 H54" opacity={0.9} />
        <path d="M10 32 H26" />
        <path d="M42 32 H54" opacity={0.35} />
        <path d="M10 46 H54" opacity={0.9} />
        <path d="M34 22 V42" />
      </g>
    </svg>
  );
}

export function Header({ paused }: { paused: boolean }) {
  const { address, connect, disconnect, connecting, error } = useWallet();

  return (
    <header className="border-b border-edge bg-surface-1/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Mark className="size-6 text-ink" />
          <span className="text-sm font-semibold tracking-tight text-ink">
            StelFlow
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone="warning">Testnet</Badge>
          {paused ? <Badge tone="critical">Creation paused</Badge> : null}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <a
            href={TESTNET.explorer}
            target="_blank"
            rel="noreferrer"
            className="tnum hidden text-xs text-ink-muted underline-offset-4 hover:text-ink-secondary hover:underline sm:inline"
            title={CONTRACT_ID}
          >
            {shortAddress(CONTRACT_ID, 6, 6)}
          </a>
          {address ? (
            <div className="flex items-center gap-2">
              <span className="tnum text-xs text-ink-secondary">
                {shortAddress(address, 4, 4)}
              </span>
              <Button variant="ghost" onClick={disconnect} className="px-2 py-1 text-xs">
                Disconnect
              </Button>
            </div>
          ) : (
            <Button variant="primary" busy={connecting} onClick={() => void connect()}>
              Connect wallet
            </Button>
          )}
        </div>

        {error ? (
          <p className="w-full text-xs text-[var(--status-critical)]">{error}</p>
        ) : null}
      </div>
    </header>
  );
}
