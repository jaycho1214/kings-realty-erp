"use server";

import { getDb, sql, type DB, type Transaction } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireUser, isAdmin } from "@/lib/authz";
import { seoulDateString, seoulWeekEnd } from "@/lib/date";
import { loadBoardData } from "@/lib/tasks/queries";
import type {
  BoardData,
  TaskStatus,
  LinkEntityType,
  TaskLinkView,
} from "@/lib/tasks/types";

export interface LinkInput {
  type: LinkEntityType;
  id: number;
}

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

async function insertLinks(
  trx: Transaction<DB>,
  taskId: number,
  links: LinkInput[],
): Promise<void> {
  const seen = new Set<string>();
  const rows = links
    .filter((l) => l && l.type && Number.isInteger(l.id) && l.id > 0)
    .filter((l) => {
      const k = `${l.type}:${l.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((l) => ({ task_id: taskId, entity_type: l.type, entity_id: l.id }));
  if (!rows.length) return;
  await trx.insertInto("task_link").values(rows).execute();
}

export interface CreateTaskInput {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  plannedDate?: string | null;
  assigneeIds?: number[];
  links?: LinkInput[];
  // Provenance when created from a suggestion (keeps it from re-suggesting).
  suggestionKey?: string | null;
  refEntityType?: string | null;
  refEntityId?: number | null;
}

export async function createTask(input: CreateTaskInput): Promise<void> {
  const session = await requireUser();
  const title = input.title?.trim();
  if (!title) throw new Error("제목을 입력하세요.");

  let planned = input.plannedDate ?? null;
  if (planned == null && input.suggestionKey && input.dueDate) {
    const today = seoulDateString();
    const weekEnd = seoulWeekEnd(today);
    planned =
      input.dueDate < today
        ? today
        : input.dueDate <= weekEnd
          ? input.dueDate
          : null;
  }

  const db = getDb();
  await db.transaction().execute(async (trx) => {
    if (input.suggestionKey) {
      const existing = await trx
        .selectFrom("task")
        .select(["id"])
        .where("suggestion_key", "=", input.suggestionKey)
        .where("status", "!=", "done")
        .executeTakeFirst();
      if (existing) return; // already added — don't duplicate
    }
    const sort_order = await nextSortOrder(trx);
    const task = await trx
      .insertInto("task")
      .values({
        title,
        notes: input.notes?.trim() || null,
        status: "todo",
        planned_date: planned,
        due_date: input.dueDate ?? null,
        sort_order,
        source: input.suggestionKey ? "suggestion" : "manual",
        suggestion_key: input.suggestionKey ?? null,
        ref_entity_type: input.refEntityType ?? null,
        ref_entity_id: input.refEntityId ?? null,
        created_by: Number(session.user.id),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await insertAssignees(trx, task.id, input.assigneeIds ?? []);
    await insertLinks(trx, task.id, input.links ?? []);
  });
  revalidatePath("/");
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  dueDate?: string | null;
  links?: LinkInput[];
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
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("task").set(patch).where("id", "=", id).execute();
    if (input.links !== undefined) {
      await trx.deleteFrom("task_link").where("task_id", "=", id).execute();
      await insertLinks(trx, id, input.links);
    }
  });
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

/** Search tenants/properties/landlords/leases/AS/appliances to attach. */
export async function searchLinkTargets(q: string): Promise<TaskLinkView[]> {
  await requireUser();
  const term = q.trim();
  if (!term) return [];
  const db = getDb();
  const like = `%${term}%`;

  const [tenants, properties, landlords, leases, services, appliances] =
    await Promise.all([
      db
        .selectFrom("tenant")
        .select(["id", "name"])
        .where("name", "ilike", like)
        .where("deleted_at", "is", null)
        .limit(6)
        .execute(),
      db
        .selectFrom("property")
        .select([
          "id",
          sql<string>`coalesce(address_jibeon, address)`.as("label"),
        ])
        .where((eb) =>
          eb.or([
            eb("address", "ilike", like),
            eb("address_jibeon", "ilike", like),
          ]),
        )
        .limit(6)
        .execute(),
      db
        .selectFrom("landlord")
        .select(["id", "name"])
        .where("name", "ilike", like)
        .limit(6)
        .execute(),
      db
        .selectFrom("lease")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .select(["lease.id as id", "tenant.name as name"])
        .where("tenant.name", "ilike", like)
        .limit(6)
        .execute(),
      db
        .selectFrom("service_request")
        .select(["id", "title"])
        .where("title", "ilike", like)
        .limit(6)
        .execute(),
      db
        .selectFrom("appliance")
        .select(["id", "name"])
        .where("name", "ilike", like)
        .limit(6)
        .execute(),
    ]);

  const out: TaskLinkView[] = [];
  for (const r of tenants) out.push({ type: "tenant", id: r.id, label: r.name });
  for (const r of properties)
    out.push({ type: "property", id: r.id, label: r.label });
  for (const r of landlords)
    out.push({ type: "landlord", id: r.id, label: r.name });
  for (const r of leases)
    out.push({ type: "lease", id: r.id, label: `${r.name} 계약` });
  for (const r of services)
    out.push({ type: "service_request", id: r.id, label: r.title });
  for (const r of appliances)
    out.push({ type: "appliance", id: r.id, label: r.name });
  return out;
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

export async function getTaskBoardData(): Promise<BoardData> {
  await requireUser();
  return loadBoardData();
}
