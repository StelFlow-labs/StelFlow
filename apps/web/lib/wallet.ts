/**
 * Wallet connection.
 *
 * The kit is loaded lazily and only in the browser: it reaches for `window` and
 * for injected extensions at construction time, which breaks server rendering.
 *
 * Nothing here ever sees a secret key. The kit hands back a signed XDR envelope;
 * signing happens inside the wallet.
 */

import type { ISupportedWallet, StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";

import { NETWORK_PASSPHRASE } from "./contract";

let kitPromise: Promise<StellarWalletsKit> | null = null;

async function getKit(): Promise<StellarWalletsKit> {
  if (typeof window === "undefined") {
    throw new Error("Wallet access is browser-only.");
  }
  if (!kitPromise) {
    kitPromise = (async () => {
      const {
        StellarWalletsKit,
        WalletNetwork,
        FREIGHTER_ID,
        FreighterModule,
        xBullModule,
        AlbedoModule,
        RabetModule,
        LobstrModule,
        HanaModule,
      } = await import("@creit.tech/stellar-wallets-kit");

      return new StellarWalletsKit({
        network:
          NETWORK_PASSPHRASE === "Test SDF Network ; September 2015"
            ? WalletNetwork.TESTNET
            : WalletNetwork.PUBLIC,
        selectedWalletId: FREIGHTER_ID,
        // Browser-extension wallets only, listed explicitly rather than via
        // `allowAllModules()`. That helper also pulls in WalletConnect and
        // Trezor, which drag a large dependency tree behind them and declare
        // peers this app does not satisfy (React 18, stellar-sdk 13). Nothing
        // here needs hardware or relay signing, so shipping them would be cost
        // without benefit.
        modules: [
          new FreighterModule(),
          new xBullModule(),
          new AlbedoModule(),
          new RabetModule(),
          new LobstrModule(),
          new HanaModule(),
        ],
      });
    })();
  }
  return kitPromise;
}

const STORAGE_KEY = "stelflow:wallet-id";

/**
 * Open the wallet picker and connect.
 *
 * Returns `null` when the user dismisses the modal — a cancelled connect is an
 * ordinary outcome, not an error to surface.
 */
export async function connect(): Promise<string | null> {
  const kit = await getKit();

  const walletId = await new Promise<string | null>((resolve) => {
    void kit.openModal({
      onWalletSelected: (option: ISupportedWallet) => resolve(option.id),
      onClosed: () => resolve(null),
    });
  });
  if (!walletId) return null;

  kit.setWallet(walletId);
  const { address } = await kit.getAddress();
  window.localStorage.setItem(STORAGE_KEY, walletId);
  return address;
}

/**
 * Restore a previous session without prompting.
 *
 * Returns `null` if the wallet was uninstalled, locked, or never connected —
 * all of which are silent on a page load rather than an error.
 */
export async function restore(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const walletId = window.localStorage.getItem(STORAGE_KEY);
  if (!walletId) return null;

  try {
    const kit = await getKit();
    kit.setWallet(walletId);
    const { address } = await kit.getAddress();
    return address;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function disconnect(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * The signer handed to the contract client.
 *
 * Matches the shape `AssembledTransaction.signAndSend` expects, so a transaction
 * assembled by the bindings can be signed by whichever wallet the user picked.
 */
export async function signTransaction(
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  const kit = await getKit();
  return kit.signTransaction(xdr, {
    networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
    address: opts?.address,
  });
}
