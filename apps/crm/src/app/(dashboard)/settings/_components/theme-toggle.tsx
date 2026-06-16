"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const themes = [
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
  { value: "system", label: "시스템", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-2">
      {themes.map((t) => {
        const active = theme === t.value;
        return (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-transparent text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            {active && <Check className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
