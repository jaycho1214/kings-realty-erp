"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SexToggleProps {
  name: string;
  defaultValue?: string | null;
  compact?: boolean;
}

export function SexToggle({
  name,
  defaultValue,
  compact = false,
}: SexToggleProps) {
  const [value, setValue] = useState(defaultValue ?? "");

  const options = compact
    ? [
        { value: "M", label: "남" },
        { value: "F", label: "여" },
      ]
    : [
        { value: "M", label: "남성" },
        { value: "F", label: "여성" },
      ];

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <div
        className={cn(
          "inline-flex h-8 rounded-lg border border-input p-0.5",
          compact ? "w-fit" : "w-full",
        )}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() =>
              setValue((prev) => (prev === opt.value ? "" : opt.value))
            }
            className={cn(
              "flex-1 rounded-md px-3 text-sm font-medium transition-all",
              value === opt.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>
  );
}
