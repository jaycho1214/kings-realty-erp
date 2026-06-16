"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
};

export function FilterTabs({
  paramKey,
  options,
  className,
}: {
  paramKey: string;
  options: FilterOption[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const current = searchParams.get(paramKey) ?? "all";

  function handleSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(paramKey);
    } else {
      params.set(paramKey, value);
    }
    params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <Tabs
      value={current}
      onValueChange={handleSelect}
      className={cn("flex-col", className)}
    >
      <TabsList aria-label={paramKey}>
        {options.map((opt) => (
          <TabsTrigger
            key={opt.value}
            value={opt.value}
            className="whitespace-nowrap"
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className="ml-1 text-[10px] tabular-nums opacity-60">
                {opt.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
