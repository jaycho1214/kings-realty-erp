"use client";

import { useEffect, useRef, useState } from "react";
import suneditor from "suneditor";
import plugins from "suneditor/src/plugins";
import type SunEditorInstance from "suneditor/src/lib/core";
import "suneditor/dist/css/suneditor.min.css";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NOTE_IMAGE_TITLE } from "@/lib/notes/constants";

interface StaffOption {
  id: number;
  name: string;
}

interface EventOption {
  id: number;
  title: string;
  date: string; // ISO
}

interface NoteComposerProps {
  tenantId: number;
  staff: StaffOption[];
  events: EventOption[];
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

// A note is "empty" when it has no visible text and no image. Mentions and
// event chips carry text, so they count as content; an image-only note is fine.
function isEditorEmpty(editor: SunEditorInstance): boolean {
  const html = editor.getContents(true);
  if (/<img\b/i.test(html)) return false;
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|\u00A0/gi, " ")
    .trim();
  return text.length === 0;
}

export default function NoteComposer({
  tenantId,
  staff,
  events,
  onSubmit,
  submitLabel,
  initialHtml,
  autoFocus,
  onCancel,
}: NoteComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<SunEditorInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [eventMenuOpen, setEventMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
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
    // Our own toolbar image button — opens the file picker instead of
    // SunEditor's default image dialog.
    const noteImagePlugin = {
      name: "noteImage",
      display: "command",
      title: "이미지 첨부",
      innerHTML:
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
      add: () => {},
      action: () => fileInputRef.current?.click(),
    };
    const editor = suneditor.create(hostRef.current, {
      plugins: { ...plugins, noteImage: noteImagePlugin } as typeof plugins,
      // "noteImage" is our custom button; no default SunEditor image dialog.
      buttonList: [
        ["bold", "italic", "underline", "link", "list", "noteImage"],
      ],
      minHeight: "66px",
      height: "auto",
      resizingBar: false,
      showPathLabel: false,
      placeholder: "메모를 입력하세요...",
      defaultTag: "p",
      // Preserve mention chips + our embedded images through SunEditor cleaning.
      attributesWhitelist: { span: "class|data-mention", img: "src|alt" },
    });
    if (initialHtml) editor.setContents(initialHtml);
    editorRef.current = editor;
    if (autoFocus) editor.core.focus();

    // Our own image handling: intercept image drops and pastes, upload them
    // ourselves, and place the <img> at the drop point / caret. Returning false
    // stops SunEditor's built-in image handling.
    editor.onDrop = (e) => {
      const de = e as DragEvent;
      const imgs = de.dataTransfer
        ? Array.from(de.dataTransfer.files).filter((f) =>
            f.type.startsWith("image/"),
          )
        : [];
      setDragging(false);
      if (imgs.length === 0) return true;
      e.preventDefault();
      const docAny = document as unknown as {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      const range = docAny.caretRangeFromPoint?.(de.clientX, de.clientY);
      const sel = editor.core.getSelection();
      if (range && sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        editor.core.focus();
      }
      imgs.forEach((f) => uploadImageFile(f));
      return false;
    };

    editor.onPaste = (e) => {
      const ce = e as ClipboardEvent;
      const imgs = ce.clipboardData
        ? Array.from(ce.clipboardData.files).filter((f) =>
            f.type.startsWith("image/"),
          )
        : [];
      if (imgs.length === 0) return true;
      e.preventDefault();
      editor.core.focus();
      imgs.forEach((f) => uploadImageFile(f));
      return false;
    };

    // Detect a trailing `@query` token at the caret and position the dropdown.
    editor.onKeyUp = () => {
      refreshEmpty();
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

    // Content-driven changes (paste, delete, programmatic inserts) gate submit.
    editor.onChange = () => refreshEmpty();
    refreshEmpty();

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshEmpty() {
    const ed = editorRef.current;
    if (ed) setIsEmpty(isEditorEmpty(ed));
  }

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
    refreshEmpty();
  }

  function insertEventLink(ev: EventOption) {
    const editor = editorRef.current;
    if (!editor) return;
    const d = new Date(ev.date);
    const href = `/calendar?year=${d.getFullYear()}&month=${d.getMonth() + 1}`;
    const label = `📅 ${escapeHtml(ev.title)}`;
    editor.core.focus();
    editor.insertHTML(
      `<a class="event-chip" data-event="${ev.id}" href="${href}">${label}</a>&nbsp;`,
      true,
      false,
    );
    setEventMenuOpen(false);
    refreshEmpty();
  }

  // Upload one image through the authenticated document proxy (private blob),
  // then embed the same-origin /api/documents/<id> URL at the current caret.
  async function uploadImageFile(file: File) {
    const editor = editorRef.current;
    if (!editor || !file.type.startsWith("image/")) return;
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("entity_type", "tenant");
      fd.set("entity_id", String(tenantId));
      fd.set("title", NOTE_IMAGE_TITLE);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) return;
      const { id } = await res.json();
      editor.insertHTML(
        `<img src="/api/documents/${id}" alt="${escapeHtml(file.name)}" />`,
        true,
        false,
      );
      refreshEmpty();
    } catch {
      // Swallow — a failed upload simply inserts nothing.
    }
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
    if (!editor || isEditorEmpty(editor)) return;
    const html = editor.getContents(true);
    setPending(true);
    try {
      await onSubmit(html);
      editor.setContents("");
      setIsEmpty(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className="note-editor relative"
      onKeyDownCapture={onKeyDownCapture}
      onDragEnter={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDragging(false);
      }}
    >
      {/* SunEditor replaces this textarea in place. */}
      <textarea ref={hostRef} defaultValue={initialHtml ?? ""} />

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-brand-weak/70 text-xs font-medium text-brand">
          여기에 이미지를 놓으세요
        </div>
      )}

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

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              files.forEach((f) => uploadImageFile(f));
              e.target.value = "";
            }}
          />
          <div className="relative">
            {events.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => setEventMenuOpen((o) => !o)}
              >
                <CalendarPlus className="size-3.5" />
                일정
              </Button>
            )}
            {eventMenuOpen && events.length > 0 && (
              <ul className="absolute bottom-full left-0 z-50 mb-1 max-h-56 w-56 overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md">
                {events.map((ev) => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-secondary/60"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertEventLink(ev);
                      }}
                    >
                      <span className="w-full truncate">{ev.title}</span>
                      <span className="tabular text-[11px] text-muted-foreground">
                        {new Date(ev.date).toLocaleDateString("ko-KR")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              취소
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={pending || isEmpty}
          >
            {pending ? "저장 중..." : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
