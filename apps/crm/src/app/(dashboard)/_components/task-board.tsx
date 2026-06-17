"use client";

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { seoulWeekEnd } from "@/lib/date";
import {
  planBucket,
  plannedDateForBucket,
  midpointSortOrder,
  type PlanBucket,
  type TaskStatus,
} from "@/lib/tasks/board";
import type { BoardData, TaskView, SuggestedTask } from "@/lib/tasks/types";
import { TaskCard } from "./task-card";
import { SuggestionRail } from "./suggestion-rail";
import { TaskDialog, type TaskDraft } from "./task-dialog";
import {
  moveTask,
  deleteTask,
  dismissSuggestion,
  snoozeSuggestion,
} from "../_task-actions";

type View = "plan" | "status";
type ColId = PlanBucket | TaskStatus;

const PLAN_COLS: { id: PlanBucket; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "this_week", label: "이번 주" },
  { id: "later", label: "예정" },
  { id: "done", label: "완료" },
];
const STATUS_COLS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "할 일" },
  { id: "in_progress", label: "진행 중" },
  { id: "done", label: "완료" },
];

function withinLast7Days(completed: string | null, today: string): boolean {
  if (!completed) return false;
  const cutoff = new Date(new Date(today).getTime() - 7 * 864e5)
    .toISOString()
    .slice(0, 10);
  return completed >= cutoff;
}

function SortableCard({
  task,
  today,
  onEdit,
  onDelete,
}: {
  task: TaskView;
  today: string;
  onEdit: (t: TaskView) => void;
  onDelete: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} today={today} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function Column({
  id,
  label,
  tasks,
  today,
  onEdit,
  onDelete,
}: {
  id: ColId;
  label: string;
  tasks: TaskView[];
  today: string;
  onEdit: (t: TaskView) => void;
  onDelete: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-72 flex-col rounded-lg bg-secondary/40 p-2",
        isOver && "ring-2 ring-brand/40",
      )}
    >
      <div className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold">
        {label}
        <span className="tabular text-[12px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <SortableCard
              key={t.id}
              task={t}
              today={today}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function TaskBoard({
  data,
  today,
  layout,
  defaultMine = false,
  onChanged,
}: {
  data: BoardData;
  today: string;
  layout: "columns" | "stack";
  defaultMine?: boolean;
  /** Called after a create/edit save — lets client surfaces (FAB) refetch. */
  onChanged?: () => void;
}) {
  const weekEnd = React.useMemo(() => seoulWeekEnd(today), [today]);
  const [view, setView] = React.useState<View>("plan");
  const [mine, setMine] = React.useState(defaultMine);
  const [assigneeFilter, setAssigneeFilter] = React.useState<number | null>(
    null,
  );
  const [tasks, setTasks] = React.useState<TaskView[]>(data.tasks);
  const [suggestions, setSuggestions] = React.useState<SuggestedTask[]>(
    data.suggestions,
  );
  const [busyKeys, setBusyKeys] = React.useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TaskView | undefined>();
  const [draft, setDraft] = React.useState<TaskDraft | undefined>();
  const [error, setError] = React.useState<string | null>(null);

  // Re-sync optimistic state when the server sends fresh props (after a
  // revalidatePath). Adjusted during render per React's "store prior props"
  // guidance — preserves view/filter UI state and avoids setState-in-effect.
  const [serverTasks, setServerTasks] = React.useState(data.tasks);
  if (serverTasks !== data.tasks) {
    setServerTasks(data.tasks);
    setTasks(data.tasks);
  }
  const [serverSuggestions, setServerSuggestions] = React.useState(
    data.suggestions,
  );
  if (serverSuggestions !== data.suggestions) {
    setServerSuggestions(data.suggestions);
    setSuggestions(data.suggestions);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const cols = view === "plan" ? PLAN_COLS : STATUS_COLS;

  const visible = React.useMemo(
    () =>
      tasks.filter((t) => {
        if (mine && !t.assignees.some((a) => a.id === data.currentUserId))
          return false;
        if (assigneeFilter && !t.assignees.some((a) => a.id === assigneeFilter))
          return false;
        return true;
      }),
    [tasks, mine, assigneeFilter, data.currentUserId],
  );

  const colOf = React.useCallback(
    (t: TaskView): ColId =>
      view === "plan"
        ? planBucket(t, today, weekEnd)
        : (t.status as TaskStatus),
    [view, today, weekEnd],
  );

  const byCol = React.useMemo(() => {
    const map = new Map<ColId, TaskView[]>();
    for (const c of cols) map.set(c.id, []);
    for (const t of visible) {
      const col = colOf(t);
      if (col === "done" && !withinLast7Days(t.completed_at, today)) continue;
      map.get(col)?.push(t);
    }
    for (const list of map.values())
      list.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [visible, cols, colOf, today]);

  function openNew() {
    setEditing(undefined);
    setDraft(undefined);
    setDialogOpen(true);
  }

  function openEdit(t: TaskView) {
    setDraft(undefined);
    setEditing(t);
    setDialogOpen(true);
  }

  async function handleDragEnd(e: DragEndEvent) {
    const activeId = Number(e.active.id);
    const overId = e.over?.id;
    if (overId == null) return;
    const moved = tasks.find((t) => t.id === activeId);
    if (!moved) return;

    let targetCol: ColId;
    if (typeof overId === "string" && overId.startsWith("col:")) {
      targetCol = overId.slice(4) as ColId;
    } else {
      const overTask = tasks.find((t) => t.id === Number(overId));
      if (!overTask) return;
      targetCol = colOf(overTask);
    }

    const colTasks = (byCol.get(targetCol) ?? []).filter(
      (t) => t.id !== activeId,
    );
    const overIdx =
      typeof overId === "string"
        ? colTasks.length
        : Math.max(
            0,
            colTasks.findIndex((t) => t.id === Number(overId)),
          );
    const before = colTasks[overIdx - 1]?.sort_order ?? null;
    const after = colTasks[overIdx]?.sort_order ?? null;
    const sortOrder = midpointSortOrder(before, after);

    let status: TaskStatus;
    let plannedDate: string | null;
    if (view === "plan") {
      if (targetCol === "done") {
        status = "done";
        plannedDate = moved.planned_date;
      } else {
        status = moved.status === "done" ? "todo" : moved.status;
        plannedDate = plannedDateForBucket(
          targetCol as "today" | "this_week" | "later",
          today,
          weekEnd,
        );
      }
    } else {
      status = targetCol as TaskStatus;
      plannedDate = moved.planned_date;
    }

    const prev = tasks;
    const completed_at =
      status === "done" ? (moved.completed_at ?? today) : null;
    setTasks((ts) =>
      ts.map((t) =>
        t.id === activeId
          ? {
              ...t,
              status,
              planned_date: plannedDate,
              sort_order: sortOrder,
              completed_at,
            }
          : t,
      ),
    );
    try {
      await moveTask(activeId, status, plannedDate, sortOrder);
    } catch {
      setTasks(prev);
      setError("이동을 저장하지 못했습니다.");
    }
  }

  function handleDelete(id: number) {
    const prev = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    deleteTask(id).catch(() => {
      setTasks(prev);
      setError("삭제하지 못했습니다.");
    });
  }

  function mark(key: string, on: boolean) {
    setBusyKeys((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // 추가 → open a prefilled dialog so the user can customize before saving.
  function handleAccept(s: SuggestedTask) {
    setEditing(undefined);
    setDraft({
      title: s.title,
      dueDate: s.dueDate,
      links: [],
      suggestionKey: s.dedupKey,
      refEntityType: s.refEntityType,
      refEntityId: s.refEntityId,
    });
    setDialogOpen(true);
  }

  function handleDismiss(key: string, snooze: boolean) {
    const removed = suggestions.find((x) => x.dedupKey === key);
    mark(key, true);
    setSuggestions((list) => list.filter((x) => x.dedupKey !== key));
    (snooze ? snoozeSuggestion(key) : dismissSuggestion(key))
      .catch(() => {
        if (removed) setSuggestions((list) => [removed, ...list]);
        setError("처리하지 못했습니다.");
      })
      .finally(() => mark(key, false));
  }

  function handleSaved() {
    // After accepting a suggestion, drop it from the rail optimistically
    // (the server also filters it out on the next load via suggestion_key).
    if (draft?.suggestionKey) {
      const key = draft.suggestionKey;
      setSuggestions((list) => list.filter((x) => x.dedupKey !== key));
    }
    // Client surfaces (FAB) don't get revalidatePath — pull fresh data so the
    // newly created/edited task appears.
    onChanged?.();
  }

  const stack = layout === "stack";

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5 text-[12px]">
          {(["plan", "status"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded px-2 py-1 font-medium",
                view === v
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {v === "plan" ? "계획" : "상태"}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border p-0.5 text-[12px]">
          {[
            { v: false, label: "전체" },
            { v: true, label: "내 할 일" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setMine(o.v)}
              className={cn(
                "rounded px-2 py-1 font-medium",
                mine === o.v
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <select
          value={assigneeFilter ?? ""}
          onChange={(e) =>
            setAssigneeFilter(e.target.value ? Number(e.target.value) : null)
          }
          className="h-7 rounded-md border bg-background px-2 text-[12px]"
        >
          <option value="">담당자 전체</option>
          {data.staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={openNew}
          className="ml-auto flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
        >
          <Plus className="size-3.5" /> 할 일
        </button>
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div
          className={cn("grid gap-2", stack && "grid-cols-1")}
          style={
            stack
              ? undefined
              : { gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }
          }
        >
          {cols.map((c) => (
            <Column
              key={c.id}
              id={c.id}
              label={c.label}
              tasks={byCol.get(c.id) ?? []}
              today={today}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </DndContext>

      {/* 추천 — below the board, horizontally scrollable */}
      <div className="border-t pt-3">
        <SuggestionRail
          suggestions={suggestions}
          today={today}
          onAccept={handleAccept}
          onDismiss={(k) => handleDismiss(k, false)}
          onSnooze={(k) => handleDismiss(k, true)}
          busyKeys={busyKeys}
        />
      </div>

      <TaskDialog
        key={
          editing
            ? `edit-${editing.id}`
            : draft
              ? `accept-${draft.suggestionKey}`
              : "new"
        }
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        staff={data.staff}
        task={editing}
        draft={draft}
        onSaved={handleSaved}
      />
    </div>
  );
}
