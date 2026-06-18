"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface AutoOption {
  /** Option identifier — an entity id (as string) for pickers, or the value
   *  itself for a plain suggestion list like ranks. */
  id: string;
  label: string;
  sublabel?: string;
}

interface AutocompleteCreateProps {
  /** Hidden input carrying the visible text (entity name/address, or the rank). */
  textName: string;
  /** Optional hidden input carrying the picked option's id (entity pickers). */
  idName?: string;
  options: AutoOption[];
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  /** Fired with the picked id, or null when the text is free / cleared. Used by
   *  the parent to reveal "new record" fields only when nothing was picked. */
  onPicked?: (id: string | null) => void;
  /** Hint label for the non-matching free-text row (e.g. "새 임대인 등록").
   *  Omit to suppress the row (e.g. a plain rank list). */
  newHint?: string;
  className?: string;
}

/**
 * A text field with autocomplete that doubles as a "create" affordance: typing
 * filters `options`; picking one records its id (via `idName`); leaving free
 * text records just the text (via `textName`). There is no existing-vs-new
 * toggle — mode is inferred downstream from whether an id was sent.
 */
export function AutocompleteCreate({
  textName,
  idName,
  options,
  placeholder,
  required,
  defaultValue = "",
  onPicked,
  newHint,
  className,
}: AutocompleteCreateProps) {
  const [query, setQuery] = useState(defaultValue);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            o.sublabel?.toLowerCase().includes(q),
        )
      : options;
    return base.slice(0, 50);
  }, [options, query]);

  const exactMatch = useMemo(
    () =>
      options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()),
    [options, query],
  );

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const setText = (value: string) => {
    setQuery(value);
    if (pickedId !== null) {
      setPickedId(null);
      onPicked?.(null);
    }
  };

  const pick = (opt: AutoOption) => {
    setQuery(opt.label);
    setPickedId(opt.id);
    setOpen(false);
    onPicked?.(opt.id);
  };

  const showNewRow = !!query.trim() && !exactMatch && !!newHint;

  return (
    <div ref={containerRef} className="relative">
      {/* textName always carries the visible text; when a row is picked, idName
          carries its id and the parser prefers the id over the text. */}
      <input type="hidden" name={textName} value={query} />
      {idName && <input type="hidden" name={idName} value={pickedId ?? ""} />}

      <div className="relative">
        <Input
          value={query}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
          className={cn("pr-7", className)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button
            type="button"
            aria-label="지우기"
            onClick={() => {
              setText("");
              setOpen(false);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (filtered.length > 0 || showNewRow) && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border bg-popover p-1 shadow-md">
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o)}
                className={cn(
                  "flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                  pickedId === o.id && "bg-accent",
                )}
              >
                <span>{o.label}</span>
                {o.sublabel && (
                  <span className="text-xs text-muted-foreground">
                    {o.sublabel}
                  </span>
                )}
              </button>
            ))}
            {showNewRow && (
              <div className="flex items-center gap-1.5 border-t px-2 py-1.5 text-xs text-muted-foreground">
                <Search className="size-3.5 shrink-0" />
                {newHint}:{" "}
                <span className="font-medium text-foreground">
                  {query.trim()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
