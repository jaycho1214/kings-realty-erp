"use client";

import { useEffect, useRef, useState } from "react";
import suneditor from "suneditor";
import plugins from "suneditor/src/plugins";
import type SunEditorInstance from "suneditor/src/lib/core";
import "suneditor/dist/css/suneditor.min.css";
import { Button } from "@/components/ui/button";
import { NOTE_IMAGE_TITLE } from "@/lib/notes/constants";

interface StaffOption {
  id: number;
  name: string;
}

interface NoteComposerProps {
  tenantId: number;
  staff: StaffOption[];
  onSubmit: (html: string) => void | Promise<void>;
  submitLabel: string;
  initialHtml?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}

// Escape a mention name so it can't inject markup into the chip.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function NoteComposer({
  tenantId,
  staff,
  onSubmit,
  submitLabel,
  initialHtml,
  autoFocus,
  onCancel,
}: NoteComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<SunEditorInstance | null>(null);
  const [pending, setPending] = useState(false);
  const [menu, setMenu] = useState<{
    query: string;
    top: number;
    left: number;
    index: number;
  } | null>(null);

  // Candidate list (users + @everyone) filtered by the active `@query`.
  const candidates: { id: string; label: string }[] = (() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    const users = staff
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((s) => ({ id: String(s.id), label: s.name }));
    const everyone =
      "everyone".includes(q) || q === ""
        ? [{ id: "everyone", label: "everyone" }]
        : [];
    return [...everyone, ...users];
  })();

  useEffect(() => {
    if (!hostRef.current) return;
    const editor = suneditor.create(hostRef.current, {
      plugins,
      buttonList: [["bold", "italic", "underline", "link", "list", "image"]],
      minHeight: "66px",
      height: "auto",
      resizingBar: false,
      showPathLabel: false,
      placeholder: "메모를 입력하세요...",
      defaultTag: "p",
      // Preserve mention chips through SunEditor's own HTML cleaning.
      attributesWhitelist: { span: "class|data-mention" },
    });
    if (initialHtml) editor.setContents(initialHtml);
    editorRef.current = editor;
    if (autoFocus) editor.core.focus();

    // Upload pasted/selected images through the authenticated document proxy
    // (private blob) and embed the same-origin /api/documents/<id> URL.
    editor.onImageUploadBefore = (files, _info, _core, uploadHandler) => {
      (async () => {
        try {
          const fd = new FormData();
          fd.set("file", files[0]);
          fd.set("entity_type", "tenant");
          fd.set("entity_id", String(tenantId));
          fd.set("title", NOTE_IMAGE_TITLE);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (!res.ok) {
            const { error } = await res.json().catch(() => ({}));
            uploadHandler({ errorMessage: error || "이미지 업로드 실패" });
            return;
          }
          const { id } = await res.json();
          uploadHandler({
            result: [
              {
                url: `/api/documents/${id}`,
                name: files[0].name,
                size: files[0].size,
              },
            ],
          });
        } catch {
          uploadHandler({ errorMessage: "이미지 업로드 실패" });
        }
      })();
      return false; // defer to the async custom upload above
    };

    // Detect a trailing `@query` token at the caret and position the dropdown.
    editor.onKeyUp = () => {
      const range = editor.core.getRange();
      const node = range.startContainer;
      if (!node || node.nodeType !== Node.TEXT_NODE) {
        setMenu(null);
        return;
      }
      const text = (node.textContent ?? "").slice(0, range.startOffset);
      const m = /(?:^|\s)@(\S*)$/.exec(text);
      if (!m) {
        setMenu(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return;
      setMenu({
        query: m[1],
        top: (rect.bottom || box.top) - box.top,
        left: (rect.left || box.left) - box.left,
        index: 0,
      });
    };

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function insertMention(id: string, label: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = editor.core.getSelection();
    if (sel && sel.rangeCount > 0 && menu) {
      // Replace the typed `@query` with the chip.
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const offset = range.startOffset;
      const consumed = menu.query.length + 1; // include the '@'
      try {
        range.setStart(node, Math.max(0, offset - consumed));
        range.setEnd(node, offset);
        range.deleteContents();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        // Range math can fail across node boundaries; fall through to insert.
      }
    }
    editor.insertHTML(
      `<span class="mention" data-mention="${id}">@${escapeHtml(label)}</span>&nbsp;`,
      true,
      false,
    );
    setMenu(null);
  }

  function onKeyDownCapture(e: React.KeyboardEvent) {
    if (!menu || candidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenu({ ...menu, index: (menu.index + 1) % candidates.length });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMenu({
        ...menu,
        index: (menu.index - 1 + candidates.length) % candidates.length,
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = candidates[menu.index];
      insertMention(c.id, c.label);
    } else if (e.key === "Escape") {
      setMenu(null);
    }
  }

  async function handleSubmit() {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.getContents(true);
    setPending(true);
    try {
      await onSubmit(html);
      editor.setContents("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className="note-editor relative"
      onKeyDownCapture={onKeyDownCapture}
    >
      {/* SunEditor replaces this textarea in place. */}
      <textarea ref={hostRef} defaultValue={initialHtml ?? ""} />

      {menu && candidates.length > 0 && (
        <ul
          className="absolute z-50 max-h-48 w-44 overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
          style={{ top: menu.top, left: menu.left }}
        >
          {candidates.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={`flex w-full items-center rounded-md px-2 py-1 text-left ${
                  i === menu.index ? "bg-secondary" : "hover:bg-secondary/60"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(c.id, c.label);
                }}
              >
                @{c.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={pending}
        >
          {pending ? "저장 중..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
