"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import { markNotificationRead, markAllNotificationsRead } from "../_actions";

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  message: string | null;
  due_date: string | null;
  ref_entity_type: string | null;
  ref_entity_id: number | null;
  is_read: boolean;
  created_at: string;
}

function hrefFor(n: NotificationRow): string | null {
  if (n.ref_entity_type === "lease" && n.ref_entity_id != null) {
    return `/leases/${n.ref_entity_id}`;
  }
  if (n.ref_entity_type === "tenant" && n.ref_entity_id != null) {
    return `/tenants/${n.ref_entity_id}`;
  }
  return null;
}

export function NotificationList({
  notifications,
}: {
  notifications: NotificationRow[];
}) {
  const [pending, startTransition] = useTransition();
  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={pending || !hasUnread}
          onClick={() => startTransition(() => markAllNotificationsRead())}
        >
          <CheckCheck className="size-4" />
          모두 읽음
        </Button>
      </div>

      <DataPanel>
        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="알림이 없습니다"
            description="계약 만료 등 알림이 여기에 표시됩니다."
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {notifications.map((n) => {
              const href = hrefFor(n);
              const body = (
                <div className="flex items-start gap-3 px-3.5 py-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-danger"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm ${n.is_read ? "text-muted-foreground" : "font-medium text-foreground"}`}
                    >
                      {n.title}
                    </div>
                    {n.message && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {n.message}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted-foreground/70">
                      {new Date(n.created_at).toLocaleDateString("ko-KR")}
                    </div>
                  </div>
                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      onClick={(e) => {
                        e.preventDefault();
                        startTransition(() => markNotificationRead(n.id));
                      }}
                      aria-label="읽음"
                    >
                      <Check className="size-4" />
                    </Button>
                  )}
                </div>
              );
              return (
                <li key={n.id} className="hover:bg-secondary/40">
                  {href ? (
                    <Link
                      href={href}
                      onClick={() =>
                        !n.is_read &&
                        startTransition(() => markNotificationRead(n.id))
                      }
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DataPanel>
    </div>
  );
}
