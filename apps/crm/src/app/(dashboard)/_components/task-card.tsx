"use client";

import Link from "next/link";
import {
  Pencil,
  Trash2,
  Users,
  Building2,
  Contact,
  FileText,
  Wrench,
  Refrigerator,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { daysUntil } from "@/lib/date";
import { cn } from "@/lib/utils";
import { linkHref } from "@/lib/tasks/links";
import type { TaskView, TaskLinkView, LinkEntityType } from "@/lib/tasks/types";

export const linkIcon: Record<LinkEntityType, LucideIcon> = {
  tenant: Users,
  property: Building2,
  landlord: Contact,
  lease: FileText,
  service_request: Wrench,
  appliance: Refrigerator,
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

/** A single attached-entity chip (deep-links to its detail page). */
export function LinkChip({ link }: { link: TaskLinkView }) {
  const Icon = linkIcon[link.type];
  return (
    <Link
      href={linkHref(link.type, link.id)}
      className="flex max-w-[140px] items-center gap-1 rounded border bg-secondary/50 px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{link.label}</span>
    </Link>
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

      {task.links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.links.map((l) => (
            <LinkChip key={`${l.type}:${l.id}`} link={l} />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <DueBadge due={task.due_date} today={today} />
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
