import { getDb } from "@kingsrealty/db";

/**
 * Current USD→KRW conversion rate for arbitrary USD amounts (charges, arrears,
 * totals). Only the $100 and $20 bill rates are maintained; anything that isn't
 * a $100 bill follows the $20 rate. A charge/bill isn't a specific bill
 * denomination, so it converts at the latest $20 rate — falling back to the
 * latest $100 rate, then any most-recent rate. Returns null if none exist.
 */
export async function getUsdToKrwRate(): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .selectFrom("exchange_rate")
    .select(["denomination", "usd_to_krw"])
    .where("denomination", "in", [20, 100])
    .orderBy("date", "desc")
    .execute();
  const latest = (denom: number) =>
    rows.find((r) => Number(r.denomination) === denom);
  const pick = latest(20) ?? latest(100) ?? rows[0];
  return pick ? Number(pick.usd_to_krw) : null;
}

/**
 * KRW value of a charge/amount given its currency, using {@link getUsdToKrwRate}
 * for USD. If no rate is available, USD amounts fall back to their face value
 * (better than dropping them from a 미납 total) — callers that need exactness
 * should surface the missing-rate case separately.
 */
export function toKrw(
  amount: number,
  currency: string,
  usdRate: number | null,
): number {
  if (currency === "USD") return Math.round(amount * (usdRate ?? 1));
  return amount;
}
