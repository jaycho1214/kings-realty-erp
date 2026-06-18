"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PresetOption {
  id: number;
  label: string;
  type: string;
}

// Searchable replacement for the line-item type <select>: type to filter
// presets (keyboard-only — ↑/↓ + Enter), keep "기타", and create a brand-new
// type inline straight from the search query ("+ 새 유형 추가").
export function TypeCombobox({
  value,
  presets,
  autoOpen = false,
  onSelect,
  onAddPreset,
}: {
  value: string;
  presets: PresetOption[];
  autoOpen?: boolean;
  onSelect: (label: string, type: string) => void;
  // Persists the new type (server + parent state) and returns it so we can
  // select it immediately. Null on failure.
  onAddPreset: (name: string) => Promise<PresetOption | null>;
}) {
  // A freshly added blank row opens straight away so staff never touch the
  // mouse; the instance mounts with the row, so seeding from the prop is enough.
  const [open, setOpen] = useState(autoOpen);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const q = search.trim();
  const exists =
    q === "기타" ||
    presets.some((p) => p.label.toLowerCase() === q.toLowerCase());

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  const pick = (label: string, type: string) => {
    onSelect(label, type);
    close();
  };

  const handleAdd = async () => {
    if (!q || adding) return;
    setAdding(true);
    const preset = await onAddPreset(q);
    setAdding(false);
    if (preset) pick(preset.label, preset.type);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-7 w-full justify-between px-2 text-sm font-normal",
              !value && "text-muted-foreground",
            )}
          />
        }
      >
        <span className="truncate">{value || "선택..."}</span>
        <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="유형 검색..."
            value={search}
            onValueChange={setSearch}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>유형 없음</CommandEmpty>
            <CommandGroup>
              {presets.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.label}
                  data-checked={value === p.label}
                  onSelect={() => pick(p.label, p.type)}
                >
                  {p.label}
                </CommandItem>
              ))}
              <CommandItem
                value="기타"
                data-checked={value === "기타"}
                onSelect={() => pick("기타", "service")}
              >
                기타
              </CommandItem>
              {/* Always visible so adding a type is discoverable — a prompt
                  when empty, an actionable item once a new name is typed. */}
              {!exists && (
                <CommandItem
                  // Value embeds the query so cmdk's filter never hides it.
                  value={`${q} __add_new__`}
                  disabled={!q || adding}
                  onSelect={handleAdd}
                >
                  <Plus className="size-3.5" />
                  <span>
                    {q
                      ? `“${q}” 새 유형 추가`
                      : "새 유형 추가 — 이름을 입력하세요"}
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
