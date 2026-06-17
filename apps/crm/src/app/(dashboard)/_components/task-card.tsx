"use client";

import Link from "next/link";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { daysUntil } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { TaskView } from "@/lib/tasks/types";

const refHref: Record<string, (id: number) => string> = {
  tenant: (id) => `/tenants/${id}`,
  lease: (id) => `/leases/${id}`,
  service_request: (id) => `/services/${id}`,
  property: (id) => `/properties/${id}`,
};

export function DueBadge({
  due,
  today,
}: {
  due: string | null;
  today: string;
}) {
  if (!due) return null;
  const dleft = daysUntil(due, today);
  const overdue = dleft < 0;
  return (
    <span
      className={cn(
        "tabular rounded px-1.5 py-0.5 text-[10.5px] font-medium",
        overdue
          ? "bg-danger/10 text-danger"
          : dleft <= 3
            ? "bg-warning/10 text-warning"
            : "text-muted-foreground",
      )}
    >
      {overdue ? `연체 ${-dleft}일` : `D-${dleft}`}
    </span>
  );
}

export function TaskCard({
  task,
  today,
  onEdit,
  onDelete,
}: {
  task: TaskView;
  today: string;
  onEdit?: (t: TaskView) => void;
  onDelete?: (id: number) => void;
}) {
  const href =
    task.ref_entity_type && task.ref_entity_id
      ? refHref[task.ref_entity_type]?.(task.ref_entity_id)
      : undefined;
  return (
    <div className="group rounded-lg border bg-card p-2.5 text-[13px] shadow-xs">
      <div className="flex items-start gap-1.5">
        <span className="flex-1 leading-snug">{task.title}</span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="수정"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-danger"
              aria-label="삭제"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <DueBadge due={task.due_date} today={today} />
        {href && (
          <Link
            href={href}
            className="text-muted-foreground hover:text-foreground"
            aria-label="원본 보기"
          >
            <ExternalLink className="size-3" />
          </Link>
        )}
        <div className="ml-auto flex -space-x-1.5">
          {task.assignees.map((u) => (
            <Avatar key={u.id} className="size-5 ring-2 ring-card">
              {u.image && <AvatarImage src={u.image} alt="" />}
              <AvatarFallback className="text-[8px]">
                {u.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      </div>
    </div>
  );
}
