"use client";

import { useState } from "react";

import { shortAddress } from "@/lib/format";
import { useWallet } from "./WalletProvider";
import { Button } from "./ui";

export function WalletButton() {
  const { address, connect, disconnect, connecting } = useWallet();
  const [copied, setCopied] = useState(false);

  if (!address) {
    return (
      <Button variant="primary" size="sm" busy={connecting} onClick={() => void connect()}>
        Connect wallet
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
        title="Copy your address"
        className="tnum rounded-lg border border-edge bg-surface-1 px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:text-ink"
      >
        {copied ? "Copied" : shortAddress(address)}
      </button>
      <Button variant="ghost" size="sm" onClick={disconnect}>
        Disconnect
      </Button>
    </div>
  );
}
