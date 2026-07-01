"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Check, Pencil, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { sanitizeNoteHtml } from "@/lib/notes/sanitize";
import {
  addTenantNote,
  editTenantNote,
  deleteTenantNote,
  toggleTenantNoteResolved,
} from "../_actions";

const NoteComposer = dynamic(() => import("./note-composer"), {
  ssr: false,
  loading: () => <div className="h-24 rounded-lg border bg-secondary/40" />,
});

interface StaffOption {
  id: number;
  name: string;
}
interface EventOption {
  id: number;
  title: string;
  date: string;
}
interface NoteRow {
  id: number;
  content: string;
  created_by: number;
  author_name: string;
  author_image: string | null;
  resolver_name: string | null;
  resolved: boolean;
  edited: boolean;
  created_at: string;
}
interface TenantNotesProps {
  tenantId: number;
  currentUserId: number | null;
  staff: StaffOption[];
  events: EventOption[];
  notes: NoteRow[];
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ko-KR")} ${d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function NoteBody({ html }: { html: string }) {
  return (
    <div
      className="note-content whitespace-pre-wrap text-sm [&_a]:text-brand [&_a]:underline [&_.mention]:font-medium [&_.mention]:text-brand"
      dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(html) }}
    />
  );
}

export function TenantNotes({
  tenantId,
  currentUserId,
  staff,
  events,
  notes,
}: TenantNotesProps) {
  const [hideResolved, setHideResolved] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // Open notes first, resolved sink to the bottom (stable within each group).
  const sorted = useMemo(
    () => [...notes].sort((a, b) => Number(a.resolved) - Number(b.resolved)),
    [notes],
  );
  const visible = hideResolved ? sorted.filter((n) => !n.resolved) : sorted;
  const resolvedCount = notes.filter((n) => n.resolved).length;

  return (
    <section className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 xl:max-h-[calc(100svh-5.75rem)]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
        <span className="text-[13px] font-semibold">메모</span>
        {resolvedCount > 0 && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={hideResolved}
              onChange={(e) => setHideResolved(e.target.checked)}
            />
            해결된 메모 숨기기
          </label>
        )}
      </header>

      <div className="shrink-0 border-b border-border/60 p-3.5">
        <NoteComposer
          tenantId={tenantId}
          staff={staff}
          events={events}
          submitLabel="메모 추가"
          onSubmit={async (html) => {
            const fd = new FormData();
            fd.set("content", html);
            await addTenantNote(tenantId, fd);
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            등록된 메모가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((n) => {
              const del = deleteTenantNote.bind(null, n.id, tenantId);
              const isAuthor =
                currentUserId != null && n.created_by === currentUserId;
              return (
                <li
                  key={n.id}
                  className={`group rounded-lg border bg-card p-3 ${
                    n.resolved ? "opacity-60" : ""
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Avatar className="size-5">
                        {n.author_image && (
                          <AvatarImage src={n.author_image} alt="" />
                        )}
                        <AvatarFallback className="text-[9px]">
                          {n.author_name.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate font-medium text-foreground/70">
                        {n.author_name}
                      </span>
                      <span className="tabular shrink-0">
                        {fmt(n.created_at)}
                      </span>
                      {n.edited && <span className="shrink-0">(수정됨)</span>}
                    </div>
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-6"
                        aria-label={n.resolved ? "미해결로 변경" : "해결"}
                        onClick={() =>
                          startTransition(() =>
                            toggleTenantNoteResolved(n.id, tenantId),
                          )
                        }
                      >
                        {n.resolved ? (
                          <RotateCcw className="size-3" />
                        ) : (
                          <Check className="size-3" />
                        )}
                      </Button>
                      {isAuthor && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-6"
                          aria-label="수정"
                          onClick={() =>
                            setEditing(editing === n.id ? null : n.id)
                          }
                        >
                          <Pencil className="size-3" />
                        </Button>
                      )}
                      <form action={del}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon-sm"
                          className="size-6 hover:text-danger"
                          aria-label="삭제"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </form>
                    </div>
                  </div>

                  {editing === n.id ? (
                    <NoteComposer
                      tenantId={tenantId}
                      staff={staff}
                      events={events}
                      initialHtml={n.content}
                      submitLabel="저장"
                      autoFocus
                      onCancel={() => setEditing(null)}
                      onSubmit={async (html) => {
                        const fd = new FormData();
                        fd.set("content", html);
                        await editTenantNote(n.id, tenantId, fd);
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <NoteBody html={n.content} />
                  )}

                  {n.resolved && n.resolver_name && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {n.resolver_name} 님이 해결함
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
