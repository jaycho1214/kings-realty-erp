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

export function TenantNotes({ tenantId, notes }: TenantNotesProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await addTenantNote(tenantId, formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-4">
      {/* Add note form */}
      <form ref={formRef} action={addAction} className="space-y-2">
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

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          등록된 메모가 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const deleteAction = deleteTenantNote.bind(null, note.id, tenantId);
            const date = new Date(note.created_at);
            return (
              <div
                key={note.id}
                className="group rounded-lg border bg-card p-3"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/70">
                      {note.author_name}
                    </span>
                    <span>
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
                      className="size-6 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </form>
                </div>
                <p className="whitespace-pre-wrap text-sm">{note.content}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
