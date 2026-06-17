import { getDb } from "@kingsrealty/db";
import { seoulDateString } from "@/lib/date";
import { rankToGroupCode } from "@/lib/oha-groups";

/**
 * Look up a tenant's OHA monthly limit: the grouped rate matching the rank's
 * OHA group + dependent_status whose effective window contains `atDate`
 * (default today). Display/compare only — never auto-deducted (§9.4).
 */
export async function getOhaLimit(
  rank: string | null | undefined,
  dependentStatus: string | null | undefined,
  region = "Default",
  atDate: string = seoulDateString(),
): Promise<{ amount: number; currency: string } | null> {
  if (!rank || !dependentStatus) return null;
  const code = rankToGroupCode(rank);
  if (!code) return null;
  const db = getDb();
  const at = new Date(atDate);
  const row = await db
    .selectFrom("oha_rate")
    .select(["amount", "currency"])
    .where("code", "=", code)
    .where("dependent_status", "=", dependentStatus)
    .where("region", "=", region)
    .where("effective_from", "<=", at)
    .where((eb) =>
      eb.or([eb("effective_to", "is", null), eb("effective_to", ">=", at)]),
    )
    .orderBy("effective_from", "desc")
    .executeTakeFirst();
  return row ? { amount: Number(row.amount), currency: row.currency } : null;
}
