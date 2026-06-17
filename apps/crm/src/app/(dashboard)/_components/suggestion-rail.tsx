"use client";

import { CalendarDays, CreditCard, Wrench, Clock, Plus, X, Clock3 } from "lucide-react";
import { DueBadge } from "./task-card";
import { cn } from "@/lib/utils";
import type { SuggestedTask, SuggestionKind } from "@/lib/tasks/types";

const kindIcon: Record<
  SuggestionKind,
  React.ComponentType<{ className?: string }>
> = {
  lease_expiry: CalendarDays,
  charge_due: CreditCard,
  service_open: Wrench,
  deros: Clock,
};

export function SuggestionRail({
  suggestions,
  today,
  onAccept,
  onDismiss,
  onSnooze,
  busyKeys,
}: {
  suggestions: SuggestedTask[];
  today: string;
  onAccept: (s: SuggestedTask) => void;
  onDismiss: (key: string) => void;
  onSnooze: (key: string) => void;
  busyKeys: Set<string>;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
        추천
        <span className="tabular text-[12px] font-medium text-muted-foreground">
          {suggestions.length}
        </span>
      </div>
      {suggestions.length === 0 ? (
        <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">
          추천 없음
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {suggestions.map((s) => {
            const Icon = kindIcon[s.kind];
            const busy = busyKeys.has(s.dedupKey);
            return (
              <div
                key={s.dedupKey}
                className={cn(
                  "rounded-lg border border-dashed bg-card/60 p-2.5 text-[13px]",
                  busy && "opacity-50",
                )}
              >
                <div className="flex items-start gap-1.5">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 leading-snug">{s.title}</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <DueBadge due={s.dueDate} today={today} />
                  <div className="ml-auto flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onAccept(s)}
                      className="flex items-center gap-1 rounded bg-brand px-1.5 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <Plus className="size-3" /> 추가
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSnooze(s.dedupKey)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label="나중에"
                    >
                      <Clock3 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDismiss(s.dedupKey)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-danger"
                      aria-label="무시"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
