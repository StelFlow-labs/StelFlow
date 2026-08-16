"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as wallet from "@/lib/wallet";

interface WalletState {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore a prior session silently. A missing or locked wallet is an ordinary
  // page load, not something to interrupt the visitor about.
  useEffect(() => {
    let cancelled = false;
    void wallet.restore().then((restored) => {
      if (!cancelled && restored) setAddress(restored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const connected = await wallet.connect();
      if (connected) setAddress(connected);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reach a wallet. Is Freighter installed and unlocked?",
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    wallet.disconnect();
    setAddress(null);
  }, []);

  const value = useMemo(
    () => ({ address, connecting, connect, disconnect, error }),
    [address, connecting, connect, disconnect, error],
  );

  return <WalletContext value={value}>{children}</WalletContext>;
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside <WalletProvider>");
  }
  return context;
}
