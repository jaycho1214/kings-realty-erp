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
import { TaskDialog } from "./task-dialog";
import {
  moveTask,
  deleteTask,
  acceptSuggestion,
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
        "flex min-h-24 flex-col rounded-lg bg-secondary/40 p-2",
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
}: {
  data: BoardData;
  today: string;
  layout: "columns" | "stack";
}) {
  const weekEnd = React.useMemo(() => seoulWeekEnd(today), [today]);
  const [view, setView] = React.useState<View>("plan");
  const [mine, setMine] = React.useState(layout === "stack");
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
  const [error, setError] = React.useState<string | null>(null);

  // Keep optimistic state in sync when the server sends fresh props.
  React.useEffect(() => setTasks(data.tasks), [data.tasks]);
  React.useEffect(() => setSuggestions(data.suggestions), [data.suggestions]);

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

  function reload() {
    // Server actions revalidate "/"; for client-only surfaces the parent
    // refreshes props. Optimistic state already reflects the change.
  }

  async function handleDragEnd(e: DragEndEvent) {
    const activeId = Number(e.active.id);
    const overId = e.over?.id;
    if (overId == null) return;
    const moved = tasks.find((t) => t.id === activeId);
    if (!moved) return;

    // Resolve the target column id from either a column droppable or a card.
    let targetCol: ColId;
    if (typeof overId === "string" && overId.startsWith("col:")) {
      targetCol = overId.slice(4) as ColId;
    } else {
      const overTask = tasks.find((t) => t.id === Number(overId));
      if (!overTask) return;
      targetCol = colOf(overTask);
    }

    // Compute neighbors in the target column (excluding the moved card).
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
    const completed_at = status === "done" ? (moved.completed_at ?? today) : null;
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

  function handleAccept(s: SuggestedTask) {
    mark(s.dedupKey, true);
    setSuggestions((list) => list.filter((x) => x.dedupKey !== s.dedupKey));
    acceptSuggestion(s)
      .catch(() => {
        setSuggestions((list) => [s, ...list]);
        setError("추가하지 못했습니다.");
      })
      .finally(() => mark(s.dedupKey, false));
  }

  function handleDismiss(key: string, snooze: boolean) {
    const removed = suggestions.find((x) => x.dedupKey === key);
    setSuggestions((list) => list.filter((x) => x.dedupKey !== key));
    (snooze ? snoozeSuggestion(key) : dismissSuggestion(key)).catch(() => {
      if (removed) setSuggestions((list) => [removed, ...list]);
      setError("처리하지 못했습니다.");
    });
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
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
          className="ml-auto flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
        >
          <Plus className="size-3.5" /> 할 일
        </button>
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}

      {/* Board + suggestions */}
      <div
        className={cn(
          "grid gap-3",
          stack ? "grid-cols-1" : "lg:grid-cols-[1fr_260px]",
        )}
      >
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
                : {
                    gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))`,
                  }
            }
          >
            {cols.map((c) => (
              <Column
                key={c.id}
                id={c.id}
                label={c.label}
                tasks={byCol.get(c.id) ?? []}
                today={today}
                onEdit={(t) => {
                  setEditing(t);
                  setDialogOpen(true);
                }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </DndContext>

        <div className={cn(stack && "border-t pt-3")}>
          <SuggestionRail
            suggestions={suggestions}
            today={today}
            onAccept={handleAccept}
            onDismiss={(k) => handleDismiss(k, false)}
            onSnooze={(k) => handleDismiss(k, true)}
            busyKeys={busyKeys}
          />
        </div>
      </div>

      <TaskDialog
        key={editing ? `edit-${editing.id}` : "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        staff={data.staff}
        task={editing}
        onSaved={reload}
      />
    </div>
  );
}
