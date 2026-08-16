/**
 * The contract boundary.
 *
 * Everything that talks to the chain goes through here, so components never
 * touch the SDK directly and there is one place to look when an ABI changes.
 *
 * Reads are simulated (`simulate: true`, no signature, no fee) and writes are
 * assembled here but signed and submitted by the caller — the wallet is the only
 * thing that ever holds a key.
 */

import { Client, networks } from "stelflow-sdk";
import type {
  MilestoneSpec,
  Position as ContractPosition,
  Settlement,
  Stream,
  StreamView,
} from "stelflow-sdk";
import { rpc } from "@stellar/stellar-sdk";

import deployments from "../../../deployments.json";

export type { MilestoneSpec, Settlement, Stream, StreamView, ContractPosition };
export type Milestone = Stream["milestones"][number];

export const TESTNET = deployments.testnet;
export const CONTRACT_ID = TESTNET.contractId;
export const NETWORK_PASSPHRASE = TESTNET.networkPassphrase;
export const RPC_URL = TESTNET.rpcUrl;
export const NATIVE_ASSET_CONTRACT = TESTNET.nativeAssetContract;

/** Guards against bindings generated from a different deployment than the one
 *  `deployments.json` claims is live — a mismatch would fail confusingly later. */
if (networks.testnet.contractId !== CONTRACT_ID) {
  throw new Error(
    `Bindings target ${networks.testnet.contractId} but deployments.json says ` +
      `${CONTRACT_ID}. Re-run \`pnpm bindings\`.`,
  );
}

export const server = new rpc.Server(RPC_URL);

/**
 * A client for reads, and for building transactions on behalf of `publicKey`.
 *
 * `publicKey` is only needed to assemble a transaction's source account; reads
 * work with any address, so a disconnected visitor can still browse.
 */
export function client(publicKey?: string) {
  return new Client({
    contractId: CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    allowHttp: RPC_URL.startsWith("http://"),
    publicKey,
  });
}

/** A read-only client, for anything that never needs a signature. */
const reader = client();

export async function streamCount(): Promise<number> {
  const { result } = await reader.stream_count();
  return Number(result);
}

/**
 * Fetch every stream, newest first.
 *
 * Fine at MVP scale and deliberately simple. The moment this is too slow, the
 * answer is the indexer in `docs/indexer-design.md` rather than a cleverer loop
 * here — see the note in the dashboard.
 */
export async function fetchStreams(limit = 60): Promise<StreamView[]> {
  const count = await streamCount();
  if (count === 0) return [];

  const ids: number[] = [];
  for (let id = count - 1; id >= 0 && ids.length < limit; id -= 1) ids.push(id);

  const settled = await Promise.allSettled(
    ids.map((id) => reader.describe({ stream_id: BigInt(id) })),
  );

  return settled.flatMap((outcome) => {
    if (outcome.status !== "fulfilled") return [];
    const view = outcome.value.result;
    // `describe` returns Result<StreamView, Error>; an archived or missing entry
    // surfaces as an error rather than throwing.
    return view.isOk?.() ? [view.unwrap()] : [];
  });
}

export async function fetchStream(id: bigint): Promise<StreamView | null> {
  const { result } = await reader.describe({ stream_id: id });
  return result.isOk?.() ? result.unwrap() : null;
}

export async function fetchPauser(): Promise<string | null> {
  const { result } = await reader.pauser();
  return result ?? null;
}

export async function fetchPausedUntil(): Promise<bigint> {
  const { result } = await reader.paused_until();
  return result;
}

/**
 * The contract's clock, not the browser's.
 *
 * Every accrual figure is evaluated against ledger time, so a client with a
 * skewed system clock would otherwise paint balances that disagree with what a
 * withdrawal actually pays.
 */
export async function ledgerTime(): Promise<bigint> {
  const latest = await server.getLatestLedger();
  const { sequence } = latest;
  const ledger = await server.getLedgers({
    startLedger: sequence,
    pagination: { limit: 1 },
  });
  const entry = ledger.ledgers[0];
  return entry
    ? BigInt(entry.ledgerCloseTime)
    : BigInt(Math.floor(Date.now() / 1000));
}
