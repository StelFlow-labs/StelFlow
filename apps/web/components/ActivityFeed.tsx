"use client";

import { activityAmount, describeActivity, type Activity } from "@/lib/events";
import { formatAmount, relativeTime } from "@/lib/format";
import { Card, CardHeader, EmptyState, Skeleton } from "./ui";

export function ActivityFeed({
  activity,
  now,
  loading,
}: {
  activity: Activity[];
  now: bigint;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Activity"
        hint="Folded from contract events. RPC keeps a rolling window, so this is recent activity rather than full history."
      />
      {loading && activity.length === 0 ? (
        <div className="space-y-3 px-5 py-4">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-9 w-full" />
          ))}
        </div>
      ) : activity.length === 0 ? (
        <EmptyState title="Nothing yet">
          Create a stream and its events will appear here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-edge">
          {activity.map((event) => {
            const amount = activityAmount(event);
            return (
              <li
                key={event.id}
                className="flex items-start justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-ink-secondary">
                    {describeActivity(event)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {event.streamId !== undefined ? (
                      <span className="tnum">#{event.streamId.toString()} · </span>
                    ) : null}
                    <span className="tnum">ledger {event.ledger}</span> ·{" "}
                    {relativeTime(event.at, now)}
                  </p>
                </div>
                {amount !== null ? (
                  <span className="tnum shrink-0 text-xs text-ink-secondary">
                    {formatAmount(amount, { maxDecimals: 4 })}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
