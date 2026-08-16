"use client";

import { useState } from "react";

import { NATIVE_ASSET_CONTRACT, type MilestoneSpec } from "@/lib/contract";
import { formatAmount, parseAmount } from "@/lib/format";
import { ON_EXPIRY_TO_RECIPIENT, ON_EXPIRY_TO_SENDER } from "@/lib/stream";
import { AssetNotice } from "./AssetNotice";
import { Alert, Button, Card, CardHeader, Field, Input } from "./ui";

const MINUTE = 60n;

interface MilestoneDraft {
  amount: string;
  approver: string;
  deadlineDays: string;
  onExpiry: number;
}

export interface StreamDraft {
  recipient: string;
  tokenId: string;
  amount: bigint;
  start: bigint;
  end: bigint;
  cliff: bigint;
  cancelable: boolean;
  milestones: MilestoneSpec[];
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
  onSubmit: (draft: StreamDraft) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("10");
  const [durationMinutes, setDurationMinutes] = useState("10");
  const [cliffMinutes, setCliffMinutes] = useState("0");
  const [cancelable, setCancelable] = useState(true);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const amountStroops = parseAmount(amount);
  const gated = milestones.reduce((sum, m) => sum + (parseAmount(m.amount) ?? 0n), 0n);
  const selfApproved = milestones.some((m) => m.approver.trim() === sender);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!/^G[A-Z2-7]{55}$/.test(recipient.trim())) {
      setError("The recipient needs to be a Stellar address, starting with G.");
      return;
    }
    if (recipient.trim() === sender) {
      setError("You can stream to yourself for testing — just use a second wallet address.");
      return;
    }
    if (!amountStroops || amountStroops <= 0n) {
      setError("Enter an amount above zero.");
      return;
    }

    const duration = BigInt(Number(durationMinutes) || 0) * MINUTE;
    if (duration <= 0n) {
      setError("Give the stream a length — even a few minutes is fine for a test.");
      return;
    }
    if (gated > amountStroops) {
      setError(
        `Your milestones add up to ${formatAmount(gated, { maxDecimals: 2 })}, which is more than you are sending. Milestones divide the amount up; they do not add to it.`,
      );
      return;
    }

    const start = now;
    const end = start + duration;
    const cliffOffset = BigInt(Number(cliffMinutes) || 0) * MINUTE;
    if (cliffOffset > duration) {
      setError("The cliff has to end before the stream does.");
      return;
    }

    const specs: MilestoneSpec[] = [];
    for (const draft of milestones) {
      const milestoneAmount = parseAmount(draft.amount);
      if (!milestoneAmount || milestoneAmount <= 0n) {
        setError("Every milestone needs an amount above zero.");
        return;
      }
      if (!/^[GC][A-Z2-7]{55}$/.test(draft.approver.trim())) {
        setError("Each approver needs a Stellar address, starting with G or C.");
        return;
      }
      const days = Number(draft.deadlineDays) || 0;
      specs.push({
        amount: milestoneAmount,
        approver: draft.approver.trim(),
        // A deadline must land at or after the stream ends, so it never resolves
        // a tranche that is still filling up.
        deadline: days > 0 ? end + BigInt(Math.round(days * 86_400)) : 0n,
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
        title="Start a stream"
        hint="Test XLM, on testnet. The whole amount moves into the contract when you confirm."
      />

      <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
        <Field label="Who is being paid" hint="Only this address can withdraw from the stream.">
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
          <Field label="Over how long" hint="Minutes, so you can watch it finish.">
            <Input
              mono
              inputMode="numeric"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </Field>
          <Field label="Cliff" hint="Minutes before anything can be taken.">
            <Input
              mono
              inputMode="numeric"
              value={cliffMinutes}
              onChange={(e) => setCliffMinutes(e.target.value)}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-edge bg-surface-0 px-3.5 py-3">
          <input
            type="checkbox"
            checked={cancelable}
            onChange={(e) => setCancelable(e.target.checked)}
            className="mt-0.5 accent-[var(--brand)]"
          />
          <span className="text-xs leading-relaxed text-ink-2">
            <span className="font-medium text-ink">I can cancel this on my own</span>
            <br />
            Leave this unticked and cancelling will need the recipient&rsquo;s
            signature as well as yours. That does not make the stream permanent —
            it means neither of you can end it without the other.
          </span>
        </label>

        <MilestoneEditor
          milestones={milestones}
          setMilestones={setMilestones}
          sender={sender}
        />

        {gated > 0n && amountStroops && amountStroops >= gated ? (
          <p className="text-xs leading-relaxed text-ink-3">
            <span className="tnum text-ink-2">
              {formatAmount(amountStroops - gated, { maxDecimals: 4 })} XLM
            </span>{" "}
            flows steadily from the start.{" "}
            <span className="tnum text-ink-2">
              {formatAmount(gated, { maxDecimals: 4 })} XLM
            </span>{" "}
            fills up alongside it but waits behind a gate.
          </p>
        ) : null}

        {selfApproved ? (
          <Alert tone="warn">
            You have named yourself as an approver. That is allowed, but the
            recipient should know: if you never approve and later cancel, the
            whole gated tranche comes back to you — including the part that had
            already built up.
          </Alert>
        ) : null}

        <AssetNotice tokenId={NATIVE_ASSET_CONTRACT} />

        {error ? <Alert tone="bad">{error}</Alert> : null}

        <Button type="submit" variant="primary" busy={busy} className="w-full">
          Deposit and start streaming
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
  const update = (index: number, patch: Partial<MilestoneDraft>) =>
    setMilestones(milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  return (
    <div className="rounded-xl border border-edge">
      <div className="flex items-center justify-between border-b border-edge px-3.5 py-2.5">
        <span className="text-xs font-medium text-ink-2">Hold part of it back?</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setMilestones([
              ...milestones,
              { amount: "", approver: sender, deadlineDays: "0", onExpiry: ON_EXPIRY_TO_SENDER },
            ])
          }
        >
          Add a milestone
        </Button>
      </div>

      {milestones.length === 0 ? (
        <p className="px-3.5 py-3 text-xs leading-relaxed text-ink-3">
          Nothing held back — the full amount flows steadily from the start.
        </p>
      ) : (
        <ul className="divide-y divide-edge">
          {milestones.map((draft, index) => (
            <li key={index} className="space-y-3 px-3.5 py-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Amount (XLM)">
                  <Input
                    mono
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={(e) => update(index, { amount: e.target.value })}
                  />
                </Field>
                <Field label="Who signs it off">
                  <Input
                    mono
                    spellCheck={false}
                    value={draft.approver}
                    onChange={(e) => update(index, { approver: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Give them a deadline" hint="Days after the stream ends. 0 waits forever.">
                  <Input
                    mono
                    inputMode="numeric"
                    value={draft.deadlineDays}
                    onChange={(e) => update(index, { deadlineDays: e.target.value })}
                  />
                </Field>
                <Field label="If the deadline passes" hint="Agreed now, visible to both of you.">
                  <select
                    value={draft.onExpiry}
                    onChange={(e) => update(index, { onExpiry: Number(e.target.value) })}
                    className="w-full rounded-xl border border-edge bg-surface-0 px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none"
                  >
                    <option value={ON_EXPIRY_TO_SENDER}>It comes back to me</option>
                    <option value={ON_EXPIRY_TO_RECIPIENT}>They get it anyway</option>
                  </select>
                </Field>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMilestones(milestones.filter((_, i) => i !== index))}
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
