"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ListChecks } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TaskBoard } from "@/app/(dashboard)/_components/task-board";
import { getTaskBoardData } from "@/app/(dashboard)/_task-actions";
import { seoulDateString } from "@/lib/date";
import type { BoardData } from "@/lib/tasks/types";

export function TaskFab() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<BoardData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const today = seoulDateString();

  // The dashboard already shows the board — no FAB there.
  if (pathname === "/") return null;

  function load() {
    setLoading(true);
    getTaskBoardData()
      .then(setData)
      .finally(() => setLoading(false));
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v && !data) load();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="할 일 보드 열기"
        className="fixed bottom-5 right-5 z-30 flex size-12 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 md:bottom-6 md:right-6"
      >
        <ListChecks className="size-5" />
      </button>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="overflow-y-auto data-[side=right]:w-[92vw] data-[side=right]:sm:max-w-5xl"
        >
          <SheetHeader>
            <SheetTitle>할 일</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {loading || !data ? (
              <p className="py-10 text-center text-[13px] text-muted-foreground">
                불러오는 중…
              </p>
            ) : (
              <TaskBoard
                data={data}
                today={today}
                layout="columns"
                defaultMine
                onChanged={load}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
