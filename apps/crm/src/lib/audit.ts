import { getDb } from "@kingsrealty/db";

/**
 * Append a row to `audit_log`. Used for sensitive actions: RRN reveal,
 * 보증금 정산 확정, etc. Never throws into the caller's critical path — audit
 * failures are logged but do not block the action.
 */
export async function logAudit(params: {
  actorId: number;
  action: string;
  entityType: string;
  entityId?: number | null;
  detail?: unknown;
}): Promise<void> {
  try {
    await getDb()
      .insertInto("audit_log")
      .values({
        actor_id: params.actorId,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId ?? null,
        detail:
          params.detail === undefined ? null : JSON.stringify(params.detail),
      })
      .execute();
  } catch (err) {
    console.error("[audit] failed to write audit log", params.action, err);
  }
}
