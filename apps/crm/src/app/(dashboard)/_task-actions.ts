"use server";

import { getDb, type DB, type Transaction } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireUser, isAdmin } from "@/lib/authz";
import { seoulDateString, seoulWeekEnd } from "@/lib/date";
import { loadBoardData } from "@/lib/tasks/queries";
import type { BoardData, SuggestedTask, TaskStatus } from "@/lib/tasks/types";

async function nextSortOrder(trx: Transaction<DB>): Promise<number> {
  const row = await trx
    .selectFrom("task")
    .select(({ fn }) => fn.max("sort_order").as("max"))
    .executeTakeFirst();
  return (Number(row?.max ?? 0) || 0) + 1;
}

function completedAtFor(status: TaskStatus): Date | null {
  return status === "done" ? new Date() : null;
}

async function insertAssignees(
  trx: Transaction<DB>,
  taskId: number,
  userIds: number[],
): Promise<void> {
  const clean = Array.from(
    new Set(userIds.filter((n) => Number.isInteger(n) && n > 0)),
  );
  if (!clean.length) return;
  await trx
    .insertInto("task_assignee")
    .values(clean.map((user_id) => ({ task_id: taskId, user_id })))
    .execute();
}

export interface CreateTaskInput {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  plannedDate?: string | null;
  assigneeIds?: number[];
}

export async function createTask(input: CreateTaskInput): Promise<void> {
  const session = await requireUser();
  const title = input.title?.trim();
  if (!title) throw new Error("제목을 입력하세요.");
  const db = getDb();
  await db.transaction().execute(async (trx) => {
    const sort_order = await nextSortOrder(trx);
    const task = await trx
      .insertInto("task")
      .values({
        title,
        notes: input.notes?.trim() || null,
        status: "todo",
        planned_date: input.plannedDate ?? null,
        due_date: input.dueDate ?? null,
        sort_order,
        source: "manual",
        created_by: Number(session.user.id),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await insertAssignees(trx, task.id, input.assigneeIds ?? []);
  });
  revalidatePath("/");
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  dueDate?: string | null;
}

export async function updateTask(
  id: number,
  input: UpdateTaskInput,
): Promise<void> {
  await requireUser();
  const db = getDb();
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error("제목을 입력하세요.");
    patch.title = t;
  }
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;
  await db.updateTable("task").set(patch).where("id", "=", id).execute();
  revalidatePath("/");
}

/** Persist a drag/drop: target status, planned_date and new sort_order. */
export async function moveTask(
  id: number,
  status: TaskStatus,
  plannedDate: string | null,
  sortOrder: number,
): Promise<void> {
  await requireUser();
  const db = getDb();
  await db
    .updateTable("task")
    .set({
      status,
      planned_date: plannedDate,
      sort_order: sortOrder,
      completed_at: completedAtFor(status),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
  revalidatePath("/");
}

export async function deleteTask(id: number): Promise<void> {
  const session = await requireUser();
  const db = getDb();
  const row = await db
    .selectFrom("task")
    .select(["created_by"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return;
  if (
    row.created_by !== Number(session.user.id) &&
    !isAdmin(session.user.role)
  ) {
    throw new Error("작성자 또는 관리자만 삭제할 수 있습니다.");
  }
  await db.deleteFrom("task").where("id", "=", id).execute();
  revalidatePath("/");
}

export async function setAssignees(
  id: number,
  userIds: number[],
): Promise<void> {
  await requireUser();
  const db = getDb();
  const clean = Array.from(
    new Set(userIds.filter((n) => Number.isInteger(n) && n > 0)),
  );
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("task_assignee").where("task_id", "=", id).execute();
    await insertAssignees(trx, id, clean);
  });
  revalidatePath("/");
}

/** Turn a suggestion into a real task (idempotent on dedupKey). */
export async function acceptSuggestion(s: SuggestedTask): Promise<void> {
  const session = await requireUser();
  const db = getDb();
  const today = seoulDateString();
  const weekEnd = seoulWeekEnd(today);

  let planned: string | null = null;
  if (s.dueDate) {
    if (s.dueDate < today) planned = today;
    else if (s.dueDate <= weekEnd) planned = s.dueDate;
    else planned = null;
  }

  await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("task")
      .select(["id"])
      .where("suggestion_key", "=", s.dedupKey)
      .where("status", "!=", "done")
      .executeTakeFirst();
    if (existing) return; // race / double-click guard
    const sort_order = await nextSortOrder(trx);
    const task = await trx
      .insertInto("task")
      .values({
        title: s.title,
        status: "todo",
        planned_date: planned,
        due_date: s.dueDate,
        sort_order,
        source: "suggestion",
        suggestion_key: s.dedupKey,
        ref_entity_type: s.refEntityType,
        ref_entity_id: s.refEntityId,
        created_by: Number(session.user.id),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await insertAssignees(trx, task.id, s.suggestedAssigneeIds);
  });
  revalidatePath("/");
}

async function upsertDismissal(
  dedupKey: string,
  dismissedUntil: string | null,
  userId: number,
): Promise<void> {
  const db = getDb();
  await db
    .insertInto("task_suggestion_dismissal")
    .values({
      dedup_key: dedupKey,
      dismissed_until: dismissedUntil,
      dismissed_by: userId,
    })
    .onConflict((oc) =>
      oc.column("dedup_key").doUpdateSet({
        dismissed_until: dismissedUntil,
        dismissed_by: userId,
      }),
    )
    .execute();
  revalidatePath("/");
}

export async function dismissSuggestion(dedupKey: string): Promise<void> {
  const session = await requireUser();
  await upsertDismissal(dedupKey, null, Number(session.user.id));
}

export async function snoozeSuggestion(dedupKey: string): Promise<void> {
  const session = await requireUser();
  const until = seoulWeekEnd(seoulDateString()); // snooze to end of this week…
  // …but at least +7 days: use the later of (week end, today+7).
  const plus7 = new Date(Date.now() + 7 * 864e5);
  const plus7Str = seoulDateString(plus7);
  await upsertDismissal(
    dedupKey,
    until > plus7Str ? until : plus7Str,
    Number(session.user.id),
  );
}

export async function getTaskBoardData(): Promise<BoardData> {
  await requireUser();
  return loadBoardData();
}
