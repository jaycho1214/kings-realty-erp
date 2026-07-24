"use client";

import * as React from "react";
import { Monitor, Zap, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  readPreference,
  subscribePreference,
  writePreference,
  type LowPcPreference,
} from "@/lib/low-pc";

const options: {
  value: LowPcPreference;
  label: string;
  icon: typeof Monitor;
}[] = [
  { value: "auto", label: "자동", icon: Monitor },
  { value: "on", label: "켜기", icon: Zap },
  { value: "off", label: "끄기", icon: Sparkles },
];

export function LowPcToggle() {
  // The value lives in localStorage, so the server can't know it. Render 자동
  // during SSR/hydration, then swap to the real value on the client.
  const preference = React.useSyncExternalStore(
    subscribePreference,
    readPreference,
    () => "auto" as LowPcPreference,
  );

  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const active = preference === o.value;
        return (
          <button
            key={o.value}
            onClick={() => writePreference(o.value)}
            aria-pressed={active}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-transparent text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            <o.icon className="size-4" />
            {o.label}
            {active && <Check className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
