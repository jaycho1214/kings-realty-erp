import { getDb, sql } from "@kingsrealty/db";
import { getSession } from "@/lib/session";
import { seoulDateString, daysUntil } from "@/lib/date";
import { getChargeTypeCatalog } from "@/lib/charge-types.server";
import { filterSuggestions } from "./suggestions";
import type {
  BoardData,
  SuggestedTask,
  TaskView,
  TaskAssigneeView,
  TaskLinkView,
  LinkEntityType,
} from "./types";

const d = (v: Date | string | null): string | null =>
  v == null ? null : seoulDateString(v instanceof Date ? v : new Date(v));

/** Resolve human labels for attached entities, keyed "type:id". */
async function resolveLinkLabels(
  db: ReturnType<typeof getDb>,
  links: { entity_type: string; entity_id: number }[],
): Promise<Map<string, string>> {
  const ids: Record<LinkEntityType, number[]> = {
    tenant: [],
    property: [],
    landlord: [],
    lease: [],
    service_request: [],
    appliance: [],
  };
  for (const l of links) {
    const t = l.entity_type as LinkEntityType;
    if (ids[t]) ids[t].push(l.entity_id);
  }
  const map = new Map<string, string>();
  const jobs: Promise<unknown>[] = [];
  if (ids.tenant.length)
    jobs.push(
      db
        .selectFrom("tenant")
        .select(["id", "name"])
        .where("id", "in", ids.tenant)
        .execute()
        .then((rs) => rs.forEach((r) => map.set(`tenant:${r.id}`, r.name))),
    );
  if (ids.property.length)
    jobs.push(
      db
        .selectFrom("property")
        .select([
          "id",
          sql<string>`coalesce(address_jibeon, address)`.as("label"),
        ])
        .where("id", "in", ids.property)
        .execute()
        .then((rs) => rs.forEach((r) => map.set(`property:${r.id}`, r.label))),
    );
  if (ids.landlord.length)
    jobs.push(
      db
        .selectFrom("landlord")
        .select(["id", "name"])
        .where("id", "in", ids.landlord)
        .execute()
        .then((rs) => rs.forEach((r) => map.set(`landlord:${r.id}`, r.name))),
    );
  if (ids.lease.length)
    jobs.push(
      db
        .selectFrom("lease")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .select(["lease.id as id", "tenant.name as name"])
        .where("lease.id", "in", ids.lease)
        .execute()
        .then((rs) =>
          rs.forEach((r) => map.set(`lease:${r.id}`, `${r.name} 계약`)),
        ),
    );
  if (ids.service_request.length)
    jobs.push(
      db
        .selectFrom("service_request")
        .select(["id", "title"])
        .where("id", "in", ids.service_request)
        .execute()
        .then((rs) =>
          rs.forEach((r) => map.set(`service_request:${r.id}`, r.title)),
        ),
    );
  if (ids.appliance.length)
    jobs.push(
      db
        .selectFrom("appliance")
        .select(["id", "name"])
        .where("id", "in", ids.appliance)
        .execute()
        .then((rs) => rs.forEach((r) => map.set(`appliance:${r.id}`, r.name))),
    );
  await Promise.all(jobs);
  return map;
}

/** Load the full shared board: tasks (+assignees), live suggestions, staff. */
export async function loadBoardData(): Promise<BoardData> {
  const db = getDb();
  const session = await getSession();
  const currentUserId = Number(session?.user?.id ?? 0);
  const today = seoulDateString();
  const in60 = new Date(Date.now() + 60 * 864e5);
  const todayDate = new Date(today);

  const [taskRows, assigneeRows, staff, dismissalRows, linkRows] =
    await Promise.all([
      db.selectFrom("task").selectAll().orderBy("sort_order", "asc").execute(),
      db
        .selectFrom("task_assignee")
        .innerJoin("user", "user.id", "task_assignee.user_id")
        .select([
          "task_assignee.task_id",
          "user.id as id",
          "user.name as name",
          "user.image as image",
        ])
        .execute(),
      db
        .selectFrom("user")
        .select(["id", "name", "image"])
        .where("role", "is not", null)
        .where("role", "not like", "%pending%")
        .orderBy("name", "asc")
        .execute(),
      db
        .selectFrom("task_suggestion_dismissal")
        .select(["dedup_key", "dismissed_until"])
        .execute(),
      db
        .selectFrom("task_link")
        .select(["task_id", "entity_type", "entity_id"])
        .execute(),
    ]);

  const labelMap = await resolveLinkLabels(db, linkRows);
  const byLinks = new Map<number, TaskLinkView[]>();
  for (const r of linkRows) {
    const type = r.entity_type as LinkEntityType;
    const list = byLinks.get(r.task_id) ?? [];
    list.push({
      type,
      id: r.entity_id,
      label:
        labelMap.get(`${type}:${r.entity_id}`) ?? `${type} #${r.entity_id}`,
    });
    byLinks.set(r.task_id, list);
  }

  const byTask = new Map<number, TaskAssigneeView[]>();
  for (const a of assigneeRows) {
    const list = byTask.get(a.task_id) ?? [];
    list.push({ id: a.id, name: a.name, image: a.image });
    byTask.set(a.task_id, list);
  }

  const tasks: TaskView[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status as TaskView["status"],
    planned_date: d(t.planned_date),
    due_date: d(t.due_date),
    sort_order: Number(t.sort_order),
    source: t.source as TaskView["source"],
    suggestion_key: t.suggestion_key,
    ref_entity_type: t.ref_entity_type,
    ref_entity_id: t.ref_entity_id,
    created_by: t.created_by,
    completed_at: d(t.completed_at),
    assignees: byTask.get(t.id) ?? [],
    links: byLinks.get(t.id) ?? [],
  }));

  // ---- Suggestion candidates from operational signals ----
  const [leases, charges, services, derosTenants] = await Promise.all([
    db
      .selectFrom("lease")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "lease.id as id",
        "lease.end_date as end_date",
        "tenant.name as tenant_name",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "address",
        ),
      ])
      .where("lease.status", "in", ["active", "renewed"])
      .where("tenant.deleted_at", "is", null)
      .where("lease.end_date", ">=", todayDate)
      .where("lease.end_date", "<=", in60)
      .execute(),
    db
      .selectFrom("charge_item")
      .innerJoin("lease", "lease.id", "charge_item.lease_id")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .select([
        "charge_item.id as id",
        "charge_item.type as type",
        "charge_item.status as status",
        "charge_item.due_date as due_date",
        "tenant.id as tenant_id",
        "tenant.name as tenant_name",
      ])
      .where("charge_item.status", "in", ["billed", "overdue"])
      .where("charge_item.amount", "is not", null)
      .where("tenant.deleted_at", "is", null)
      .execute(),
    db
      .selectFrom("service_request")
      .innerJoin("lease", "lease.id", "service_request.lease_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "service_request.id as id",
        "service_request.category as category",
        "service_request.scheduled_date as scheduled_date",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "address",
        ),
      ])
      .where("service_request.status", "in", [
        "received",
        "pending_repair",
        "in_progress",
        "postponed",
      ])
      .execute(),
    db
      .selectFrom("tenant")
      .select(["id", "name", "deros"])
      .where("status", "=", "active")
      .where("deleted_at", "is", null)
      .where("deros", ">=", todayDate)
      .where("deros", "<=", in60)
      .execute(),
  ]);

  // service assignee prefill
  const svcAssignees = await db
    .selectFrom("service_request_assignee")
    .select(["service_request_id", "user_id"])
    .where(
      "service_request_id",
      "in",
      services.length ? services.map((s) => s.id) : [0],
    )
    .execute();
  const svcAssigneeMap = new Map<number, number[]>();
  for (const a of svcAssignees) {
    const list = svcAssigneeMap.get(a.service_request_id) ?? [];
    list.push(a.user_id);
    svcAssigneeMap.set(a.service_request_id, list);
  }

  const { map: chargeTypeCatalog } = await getChargeTypeCatalog();
  const chargeTypeLabel: Record<string, string> = Object.fromEntries(
    Object.entries(chargeTypeCatalog).map(([type, v]) => [type, v.label]),
  );

  const candidates: SuggestedTask[] = [];

  for (const l of leases) {
    const dleft = daysUntil(l.end_date, today);
    const milestone =
      dleft <= 7 ? 7 : dleft <= 30 ? 30 : dleft <= 60 ? 60 : null;
    if (milestone == null) continue;
    candidates.push({
      dedupKey: `lease_expiry:${l.id}:${milestone}`,
      kind: "lease_expiry",
      title: `계약 만료 D-${dleft} · ${l.tenant_name} ${l.address}`,
      dueDate: d(l.end_date),
      refEntityType: "lease",
      refEntityId: l.id,
      suggestedAssigneeIds: [],
    });
  }

  for (const c of charges) {
    const label = chargeTypeLabel[c.type] ?? c.type;
    candidates.push({
      dedupKey: `charge_due:${c.id}`,
      kind: "charge_due",
      title: `${c.status === "overdue" ? "연체" : "미납"} ${label} · ${c.tenant_name}`,
      dueDate: d(c.due_date),
      refEntityType: "tenant",
      refEntityId: c.tenant_id,
      suggestedAssigneeIds: [],
    });
  }

  for (const s of services) {
    candidates.push({
      dedupKey: `service_open:${s.id}`,
      kind: "service_open",
      title: `AS ${s.category} · ${s.address}`,
      dueDate: d(s.scheduled_date),
      refEntityType: "service_request",
      refEntityId: s.id,
      suggestedAssigneeIds: svcAssigneeMap.get(s.id) ?? [],
    });
  }

  for (const t of derosTenants) {
    const dleft = daysUntil(t.deros as Date, today);
    candidates.push({
      dedupKey: `deros:${t.id}:60`,
      kind: "deros",
      title: `DEROS 임박 D-${dleft} · ${t.name}`,
      dueDate: d(t.deros),
      refEntityType: "tenant",
      refEntityId: t.id,
      suggestedAssigneeIds: [],
    });
  }

  const activeKeys = new Set(
    taskRows
      .filter((t) => t.suggestion_key && t.status !== "done")
      .map((t) => t.suggestion_key as string),
  );
  const dismissals = new Map<string, string | null>(
    dismissalRows.map((r) => [r.dedup_key, d(r.dismissed_until)]),
  );

  const suggestions = filterSuggestions(
    candidates,
    activeKeys,
    dismissals,
    today,
  );

  return { tasks, suggestions, staff, currentUserId };
}
