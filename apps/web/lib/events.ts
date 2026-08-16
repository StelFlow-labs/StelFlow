/**
 * The activity feed, folded from contract events.
 *
 * Soroban contracts cannot be queried historically from inside the chain, so
 * anything about the past is reconstructed from the event log — the read path
 * `docs/indexer-design.md` describes. At MVP scale this reads RPC's `getEvents`
 * directly rather than running the indexer service that document specifies.
 *
 * That trade is deliberate and has one consequence worth stating plainly in the
 * UI: **RPC retains only a rolling window of events**, so this feed shows recent
 * activity rather than a stream's whole history. Reconstructing the full history
 * is exactly the job the indexer exists to do.
 *
 * Events are declared with `#[contractevent]`, so each carries a map of named
 * fields. Decoding reads fields by name — adding a field to the contract later
 * cannot silently shift what this parses.
 */

import { scValToNative, xdr } from "@stellar/stellar-sdk";

import { CONTRACT_ID, server } from "./contract";

/**
 * Event names as they appear on chain.
 *
 * `#[contractevent]` derives the topic from the struct name in **snake_case**,
 * so `StreamCreated` is published as `stream_created`. Matching on the Rust
 * type name silently drops every event — the filter is not an error, it just
 * never fires — so these are written the way the chain actually spells them.
 */
export type ActivityKind =
  | "stream_created"
  | "withdrawn"
  | "milestone_approved"
  | "stream_canceled"
  | "paused"
  | "unpaused"
  | "pauser_changed";

export interface Activity {
  id: string;
  kind: ActivityKind;
  /** Absent on the contract-wide pause events, which belong to no stream. */
  streamId?: bigint;
  ledger: number;
  at: bigint;
  fields: Record<string, unknown>;
}

const KNOWN: ReadonlySet<string> = new Set<ActivityKind>([
  "stream_created",
  "withdrawn",
  "milestone_approved",
  "stream_canceled",
  "paused",
  "unpaused",
  "pauser_changed",
]);

/**
 * Roughly 24 hours at 5-second ledgers.
 *
 * Deliberately not the full retention window. RPC scans a bounded span per
 * request, so a wider start costs proportionally more round trips to reach the
 * head of the chain for no extra recent activity.
 */
const RECENT_LEDGERS = 17_280;

/** Cursor pages to follow. One page covers ~10,000 ledgers, so this reaches the
 *  head from `RECENT_LEDGERS` back with margin. */
const MAX_PAGES = 4;

/**
 * Read recent contract events, following RPC's cursor.
 *
 * The pagination is not optional, and skipping it fails *silently* — which is
 * why it is spelled out here rather than left to the reader. RPC scans a bounded
 * span of ledgers per request. When no matching event falls inside that span it
 * returns **an empty page plus a cursor**, not an error and not the events from
 * further along the requested range. A single wide `startLedger` query therefore
 * reports "no activity" for a contract that has plenty; it simply has none in
 * the first chunk scanned.
 *
 * `oldestLedger` comes from `getHealth` rather than being assumed, because
 * retention is a node setting that differs between providers.
 */
export async function fetchActivity(limit = 40): Promise<Activity[]> {
  const [health, latest] = await Promise.all([
    server.getHealth(),
    server.getLatestLedger(),
  ]);

  const filters = [{ type: "contract" as const, contractIds: [CONTRACT_ID] }];
  const startLedger = Math.max(
    health.oldestLedger,
    latest.sequence - RECENT_LEDGERS,
  );

  const collected: Activity[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await server.getEvents(
      cursor ? { filters, limit, cursor } : { startLedger, filters, limit },
    );

    for (const raw of response.events) {
      const event = decode(raw);
      if (event) collected.push(event);
    }

    if (!response.cursor || collected.length >= limit) break;
    cursor = response.cursor;
  }

  // Events arrive oldest-first; the feed reads newest-first.
  return collected.slice(-limit).reverse();
}

interface RawEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  topic: xdr.ScVal[];
  value: xdr.ScVal;
}

function decode(raw: RawEvent): Activity | null {
  const topics = raw.topic.map(toNative);
  const name = topics[0];
  if (typeof name !== "string" || !KNOWN.has(name)) return null;

  const data = toNative(raw.value);
  const fields =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  // stream_id is the first topic after the event name on every stream event.
  const streamId = typeof topics[1] === "bigint" ? topics[1] : undefined;

  return {
    id: raw.id,
    kind: name as ActivityKind,
    streamId,
    ledger: raw.ledger,
    at: BigInt(Math.floor(new Date(raw.ledgerClosedAt).getTime() / 1000)),
    fields,
  };
}

function toNative(value: xdr.ScVal): unknown {
  try {
    return scValToNative(value);
  } catch {
    return null;
  }
}

/** One line of prose per event, for the feed. */
export function describeActivity(event: Activity): string {
  const { fields } = event;
  switch (event.kind) {
    case "stream_created":
      return "A stream started and the money was locked in";
    case "withdrawn":
      return "The recipient took what they had earned";
    case "milestone_approved":
      return `A milestone was signed off, releasing what it held`;
    case "stream_canceled":
      return "A stream was stopped and both sides settled";
    case "paused":
      return "New streams were paused";
    case "unpaused":
      return "New streams were allowed again";
    case "pauser_changed":
      // "Transferred" would be wrong for the first one: the constructor emits
      // this too, and at that point there is no prior holder to transfer from.
      return fields.pauser
        ? "The pause key was set"
        : "The pause key was given up for good";
  }
}

/** The stroop amount an event moved, when it moved one. */
export function activityAmount(event: Activity): bigint | null {
  const { fields } = event;
  switch (event.kind) {
    case "stream_created":
      return asBigint(fields.total);
    case "withdrawn":
      return asBigint(fields.amount);
    case "milestone_approved":
      return asBigint(fields.amount);
    case "stream_canceled":
      return asBigint(fields.refund_to_sender);
    default:
      return null;
  }
}

function asBigint(value: unknown): bigint | null {
  return typeof value === "bigint" ? value : null;
}
