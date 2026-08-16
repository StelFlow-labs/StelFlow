/**
 * What we can tell a user about the asset they are about to stream.
 *
 * This exists because the threat model *accepts* issuer clawback as unfixable
 * on the explicit condition that the interface discloses it. An issuer who
 * enabled clawback can burn funds out of a live stream and the contract cannot
 * stop them, so the only honest mitigation is telling people which assets carry
 * that power — before they escrow anything.
 */

import { Contract, TransactionBuilder, rpc, scValToNative } from "@stellar/stellar-sdk";

import { NETWORK_PASSPHRASE, RPC_URL, server } from "./contract";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

/** A throwaway account for read-only simulation; it is never funded or signed. */
const SIMULATION_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export type ClawbackStatus = "none" | "enabled" | "unknown";

export interface AssetInfo {
  code: string;
  issuer: string | null;
  clawback: ClawbackStatus;
}

const cache = new Map<string, AssetInfo>();

/**
 * Resolve a token contract to its asset and clawback status.
 *
 * Failure resolves to `unknown` rather than `none`. Reporting "no clawback"
 * because a lookup failed would be worse than saying nothing — it is the one
 * answer that could talk someone into a stream they would otherwise avoid.
 */
export async function assetInfo(tokenId: string): Promise<AssetInfo> {
  const cached = cache.get(tokenId);
  if (cached) return cached;

  let info: AssetInfo = { code: "Unknown asset", issuer: null, clawback: "unknown" };

  try {
    const name = await readTokenName(tokenId);

    if (name === "native") {
      // Native XLM has no issuer account, so there is nobody who could enable
      // clawback on it.
      info = { code: "XLM", issuer: null, clawback: "none" };
    } else {
      const [code, issuer] = name.split(":");
      info = { code: code ?? name, issuer: issuer ?? null, clawback: "unknown" };
      if (issuer) {
        info.clawback = await issuerClawback(issuer);
      }
    }
  } catch {
    // Leaves `unknown`, which the UI renders as an explicit "we could not check".
  }

  cache.set(tokenId, info);
  return info;
}

/**
 * The Stellar Asset Contract reports `CODE:ISSUER` for a classic asset, or the
 * literal `native` for XLM.
 */
async function readTokenName(tokenId: string): Promise<string> {
  const account = await new rpc.Server(RPC_URL)
    .getAccount(SIMULATION_SOURCE)
    .catch(() => null);

  const source =
    account ??
    new (await import("@stellar/stellar-sdk")).Account(SIMULATION_SOURCE, "0");

  const tx = new TransactionBuilder(source, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(tokenId).call("name"))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulated) || !simulated.result?.retval) {
    throw new Error("Could not read the token's name.");
  }
  return String(scValToNative(simulated.result.retval));
}

async function issuerClawback(issuer: string): Promise<ClawbackStatus> {
  const response = await fetch(`${HORIZON_URL}/accounts/${issuer}`);
  if (!response.ok) return "unknown";
  const account: { flags?: { auth_clawback_enabled?: boolean } } = await response.json();
  if (account.flags?.auth_clawback_enabled === undefined) return "unknown";
  return account.flags.auth_clawback_enabled ? "enabled" : "none";
}
