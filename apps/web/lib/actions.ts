/**
 * The write path.
 *
 * Each function assembles a transaction with the generated bindings, hands it to
 * the wallet to sign, and submits it. Simulation happens during assembly, so a
 * call that would fail on chain fails here — before the user is asked for a
 * signature — and surfaces as a typed contract error rather than a raw envelope
 * rejection.
 */

import { client, type MilestoneSpec } from "./contract";
import { signTransaction } from "./wallet";

/** Contract error codes, from `contracts/stelflow/src/error.rs`. */
const ERROR_MESSAGES: Record<number, string> = {
  3: "The end time must be after the start time.",
  4: "The cliff has to fall between the start and end times.",
  5: "Amounts must be greater than zero.",
  6: "The milestone amounts add up to more than the deposit.",
  7: "Too many milestones on one stream.",
  8: "The token moved nothing, so there is no stream to create.",
  9: "No stream with that id.",
  10: "Nothing to withdraw yet.",
  11: "No milestone at that index.",
  12: "That tranche was already returned to the sender.",
  13: "This stream has already been cancelled.",
  14: "New streams are paused. Existing streams are unaffected.",
  15: "Only the pauser can do that.",
  16: "Rejected: the payout would have exceeded the stream's own deposit.",
  17: "Arithmetic overflow.",
};

export class ContractCallError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "ContractCallError";
  }
}

/**
 * Turn whatever the SDK threw into something worth showing a person.
 *
 * The contract assigns a distinct code per failure specifically so this is
 * possible — "transaction failed" is not a useful thing to read.
 */
function toFriendlyError(cause: unknown): ContractCallError {
  const text = cause instanceof Error ? cause.message : String(cause);

  const match = /Error\(Contract, #(\d+)\)/.exec(text);
  if (match?.[1]) {
    const code = Number(match[1]);
    return new ContractCallError(
      ERROR_MESSAGES[code] ?? `The contract rejected this (code ${code}).`,
      code,
    );
  }
  if (/User (declined|rejected)|denied/i.test(text)) {
    return new ContractCallError("Signature declined in the wallet.");
  }
  return new ContractCallError(text);
}

/** The `Result<T, E>` shape the bindings return for a fallible contract call. */
interface ContractResult<T> {
  unwrap(): T;
}

function isContractResult<T>(value: unknown): value is ContractResult<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ContractResult<T>).unwrap === "function"
  );
}

/**
 * Assemble, sign, submit, and unwrap.
 *
 * Every fallible entry point returns `Result<T, Error>`, which the bindings
 * surface as a wrapper rather than a thrown exception. Unwrapping here means
 * callers get a plain value or a `ContractCallError` — never a Result they might
 * forget to check.
 */
async function submit<T>(
  assemble: () => Promise<{
    signAndSend: (opts: {
      signTransaction: typeof signTransaction;
    }) => Promise<{ result: T | ContractResult<T> }>;
  }>,
): Promise<T> {
  try {
    const tx = await assemble();
    const { result } = await tx.signAndSend({ signTransaction });
    return isContractResult<T>(result) ? result.unwrap() : (result as T);
  } catch (cause) {
    throw toFriendlyError(cause);
  }
}

export interface CreateStreamInput {
  sender: string;
  recipient: string;
  tokenId: string;
  amount: bigint;
  start: bigint;
  end: bigint;
  cliff: bigint;
  cancelable: boolean;
  milestones: MilestoneSpec[];
}

export async function createStream(input: CreateStreamInput) {
  const contract = client(input.sender);
  return submit(() =>
    contract.create_stream({
      sender: input.sender,
      recipient: input.recipient,
      token_id: input.tokenId,
      amount: input.amount,
      start: input.start,
      end: input.end,
      cliff: input.cliff,
      cancelable: input.cancelable,
      milestones: input.milestones,
    }),
  );
}

export async function withdraw(streamId: bigint, recipient: string) {
  return submit(() => client(recipient).withdraw({ stream_id: streamId }));
}

export async function approveMilestone(
  streamId: bigint,
  index: number,
  approver: string,
) {
  return submit(() =>
    client(approver).approve_milestone({ stream_id: streamId, index }),
  );
}

/**
 * Cancel a stream.
 *
 * On a non-cancelable stream the contract requires the recipient's authorization
 * alongside the sender's. Simulation builds an auth tree demanding both, so the
 * wallet is asked for whatever is actually needed — the caller does not have to
 * know which case they are in.
 */
export async function cancelStream(streamId: bigint, caller: string) {
  return submit(() => client(caller).cancel({ stream_id: streamId }));
}

/** Extend a stream's TTL. Permissionless — any address may pay to do it. */
export async function bumpStream(streamId: bigint, caller: string) {
  return submit(() => client(caller).bump_stream({ stream_id: streamId }));
}

export async function pause(pauser: string) {
  return submit(() => client(pauser).pause());
}

export async function unpause(pauser: string) {
  return submit(() => client(pauser).unpause());
}
