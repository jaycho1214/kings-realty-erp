"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { addTenantNote, deleteTenantNote } from "../_actions";

interface TenantNote {
  id: number;
  content: string;
  created_at: Date | string;
  author_name: string;
}

interface TenantNotesProps {
  tenantId: number;
  notes: TenantNote[];
}

/**
 * Self-contained notes panel. Sized to live in the detail side rail: the header
 * and add form stay pinned while the list scrolls within the viewport on xl+,
 * and the whole thing flows naturally when stacked below the tabs on narrow
 * screens.
 */
export function TenantNotes({ tenantId, notes }: TenantNotesProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await addTenantNote(tenantId, formData);
    formRef.current?.reset();
  };

  return (
    <section className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 xl:max-h-[calc(100svh-5.75rem)]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
        <span className="text-[13px] font-semibold">메모</span>
        <span className="tabular inline-flex min-w-5 items-center justify-center rounded-md bg-secondary px-1 text-[11px] font-medium text-muted-foreground">
          {notes.length}
        </span>
      </header>

      {/* Add note */}
      <form
        ref={formRef}
        action={addAction}
        className="shrink-0 space-y-2 border-b border-border/60 p-3.5"
      >
        <Textarea
          name="content"
          placeholder="메모를 입력하세요..."
          rows={2}
          required
        />
        <div className="flex justify-end">
          <SubmitButton label="메모 추가" />
        </div>
      </form>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {notes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            등록된 메모가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => {
              const deleteAction = deleteTenantNote.bind(
                null,
                note.id,
                tenantId,
              );
              const date = new Date(note.created_at);
              return (
                <li
                  key={note.id}
                  className="group rounded-lg border bg-card p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate font-medium text-foreground/70">
                        {note.author_name}
                      </span>
                      <span className="tabular shrink-0">
                        {date.toLocaleDateString("ko-KR")}{" "}
                        {date.toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <form action={deleteAction}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                        aria-label="메모 삭제"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </form>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
