"use client";

import { useState } from "react";

import { NATIVE_ASSET_CONTRACT, type MilestoneSpec } from "@/lib/contract";
import { formatAmount, parseAmount } from "@/lib/format";
import { ON_EXPIRY_TO_RECIPIENT, ON_EXPIRY_TO_SENDER } from "@/lib/stream";
import { Button, Card, CardHeader, Field, Input } from "./ui";

const MINUTE = 60n;

interface MilestoneDraft {
  amount: string;
  approver: string;
  deadlineDays: string;
  onExpiry: number;
}

export function CreateStreamForm({
  sender,
  now,
  busy,
  onSubmit,
}: {
  sender: string;
  now: bigint;
  busy: boolean;
  onSubmit: (input: {
    recipient: string;
    tokenId: string;
    amount: bigint;
    start: bigint;
    end: bigint;
    cliff: bigint;
    cancelable: boolean;
    milestones: MilestoneSpec[];
  }) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("10");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [cliffMinutes, setCliffMinutes] = useState("0");
  const [cancelable, setCancelable] = useState(true);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const amountStroops = parseAmount(amount);
  const gated = milestones.reduce(
    (sum, m) => sum + (parseAmount(m.amount) ?? 0n),
    0n,
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!/^G[A-Z2-7]{55}$/.test(recipient.trim())) {
      setError("The recipient must be a Stellar public key (G…).");
      return;
    }
    if (!amountStroops || amountStroops <= 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }
    const duration = BigInt(Number(durationMinutes) || 0) * MINUTE;
    if (duration <= 0n) {
      setError("The stream needs a duration.");
      return;
    }
    if (gated > amountStroops) {
      setError(
        `Milestones total ${formatAmount(gated, { maxDecimals: 2 })}, which is more than the deposit. Milestones carve up the deposit; they do not add to it.`,
      );
      return;
    }

    const start = now;
    const end = start + duration;
    const cliffOffset = BigInt(Number(cliffMinutes) || 0) * MINUTE;
    if (cliffOffset > duration) {
      setError("The cliff cannot fall after the stream ends.");
      return;
    }

    const specs: MilestoneSpec[] = [];
    for (const draft of milestones) {
      const milestoneAmount = parseAmount(draft.amount);
      if (!milestoneAmount || milestoneAmount <= 0n) {
        setError("Every milestone needs an amount greater than zero.");
        return;
      }
      if (!/^G[A-Z2-7]{55}$|^C[A-Z2-7]{55}$/.test(draft.approver.trim())) {
        setError("Each approver must be a Stellar address (G… or C…).");
        return;
      }
      const days = Number(draft.deadlineDays) || 0;
      // A deadline must fall at or after `end`, so the contract never resolves a
      // tranche that is still accruing. Zero means no deadline.
      const deadline = days > 0 ? end + BigInt(Math.round(days * 86_400)) : 0n;
      specs.push({
        amount: milestoneAmount,
        approver: draft.approver.trim(),
        deadline,
        on_expiry: draft.onExpiry,
      });
    }

    onSubmit({
      recipient: recipient.trim(),
      tokenId: NATIVE_ASSET_CONTRACT,
      amount: amountStroops,
      start,
      end,
      cliff: start + cliffOffset,
      cancelable,
      milestones: specs,
    });
  }

  return (
    <Card>
      <CardHeader
        title="Create a stream"
        hint="Streams native XLM on testnet. The whole amount is escrowed at creation."
      />
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        <Field
          label="Recipient"
          hint="The only address that can withdraw from this stream."
        >
          <Input
            mono
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="G…"
            spellCheck={false}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Amount (XLM)">
            <Input
              mono
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Duration (minutes)" hint="Kept short for testing.">
            <Input
              mono
              inputMode="numeric"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </Field>
          <Field label="Cliff (minutes)" hint="0 for none.">
            <Input
              mono
              inputMode="numeric"
              value={cliffMinutes}
              onChange={(e) => setCliffMinutes(e.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-start gap-2.5 rounded-lg border border-edge bg-surface-0 px-3 py-2.5">
          <input
            type="checkbox"
            checked={cancelable}
            onChange={(e) => setCancelable(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs text-ink-secondary">
            <span className="font-medium text-ink">Cancelable by you alone</span>
            <br />
            Unchecked, cancelling needs the recipient&rsquo;s signature alongside
            yours. It does not make the stream permanent — it means neither of you
            can end it without the other.
          </span>
        </label>

        <MilestoneEditor
          milestones={milestones}
          setMilestones={setMilestones}
          sender={sender}
        />

        {gated > 0n && amountStroops ? (
          <p className="text-xs text-ink-muted">
            Base tranche:{" "}
            <span className="tnum text-ink-secondary">
              {formatAmount(amountStroops - gated, { maxDecimals: 4 })} XLM
            </span>{" "}
            streams unconditionally.{" "}
            <span className="tnum text-ink-secondary">
              {formatAmount(gated, { maxDecimals: 4 })} XLM
            </span>{" "}
            accrues behind gates.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/10 px-3 py-2 text-xs text-[var(--status-critical)]">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" busy={busy} className="w-full">
          Escrow deposit and open stream
        </Button>
      </form>
    </Card>
  );
}

function MilestoneEditor({
  milestones,
  setMilestones,
  sender,
}: {
  milestones: MilestoneDraft[];
  setMilestones: (next: MilestoneDraft[]) => void;
  sender: string;
}) {
  return (
    <div className="rounded-lg border border-edge">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="text-xs font-medium text-ink-secondary">
          Milestone gates
        </span>
        <Button
          type="button"
          variant="ghost"
          className="px-2 py-1 text-xs"
          onClick={() =>
            setMilestones([
              ...milestones,
              {
                amount: "",
                approver: sender,
                deadlineDays: "0",
                onExpiry: ON_EXPIRY_TO_SENDER,
              },
            ])
          }
        >
          Add gate
        </Button>
      </div>

      {milestones.length === 0 ? (
        <p className="px-3 py-3 text-xs text-ink-muted">
          None. The whole amount streams unconditionally.
        </p>
      ) : (
        <ul className="divide-y divide-edge">
          {milestones.map((draft, index) => (
            <li key={index} className="space-y-3 px-3 py-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Amount (XLM)">
                  <Input
                    mono
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={(e) =>
                      setMilestones(
                        milestones.map((m, i) =>
                          i === index ? { ...m, amount: e.target.value } : m,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Approver">
                  <Input
                    mono
                    value={draft.approver}
                    spellCheck={false}
                    onChange={(e) =>
                      setMilestones(
                        milestones.map((m, i) =>
                          i === index ? { ...m, approver: e.target.value } : m,
                        ),
                      )
                    }
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Deadline (days after end)"
                  hint="0 waits indefinitely."
                >
                  <Input
                    mono
                    inputMode="numeric"
                    value={draft.deadlineDays}
                    onChange={(e) =>
                      setMilestones(
                        milestones.map((m, i) =>
                          i === index ? { ...m, deadlineDays: e.target.value } : m,
                        ),
                      )
                    }
                  />
                </Field>
                <Field
                  label="If the deadline passes"
                  hint="Agreed now, visible to both parties."
                >
                  <select
                    value={draft.onExpiry}
                    onChange={(e) =>
                      setMilestones(
                        milestones.map((m, i) =>
                          i === index
                            ? { ...m, onExpiry: Number(e.target.value) }
                            : m,
                        ),
                      )
                    }
                    className="w-full rounded-lg border border-edge bg-surface-0 px-3 py-2 text-sm text-ink focus:border-edge-strong focus:outline-none"
                  >
                    <option value={ON_EXPIRY_TO_SENDER}>
                      Return to sender
                    </option>
                    <option value={ON_EXPIRY_TO_RECIPIENT}>
                      Release to recipient
                    </option>
                  </select>
                </Field>
              </div>

              <Button
                type="button"
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() =>
                  setMilestones(milestones.filter((_, i) => i !== index))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
