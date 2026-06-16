"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { isStaffOrAdmin } from "@/lib/authz";

/**
 * Split `total` into parts proportional to `weights`, each rounded to 2
 * decimals, such that the parts sum back to `total` exactly (largest-remainder
 * method — avoids rounding drift). Used to allocate a single USD payment across
 * the line items it covers.
 */
function allocateProportional(total: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (totalWeight <= 0) {
    // No meaningful weights — put the whole amount on the first line.
    return weights.map((_, i) => (i === 0 ? total : 0));
  }
  const totalCents = Math.round(total * 100);
  const exact = weights.map((w) => (totalCents * w) / totalWeight);
  const cents = exact.map((x) => Math.floor(x));
  const remainder = totalCents - cents.reduce((a, b) => a + b, 0);
  const byFraction = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder && k < byFraction.length; k++) {
    cents[byFraction[k].i] += 1;
  }
  return cents.map((c) => c / 100);
}

export async function createBulkPayment(formData: FormData) {
  const session = await getSession();
  if (!session?.user?.id || !isStaffOrAdmin(session.user.role)) {
    return { success: false, error: "권한이 없습니다." };
  }

  const db = getDb();

  const lease_id = Number(formData.get("lease_id") as string);
  const billing_month = new Date(
    (formData.get("billing_month") as string) + "-01",
  );
  const payment_method = formData.get("payment_method") as string;
  const payment_date = new Date(formData.get("payment_date") as string);
  const notes = (formData.get("notes") as string) || null;

  // Parse line items
  const itemCount = Number(formData.get("item_count") ?? "0");
  const items: { type: string; label: string; amount_krw: number }[] = [];
  for (let i = 0; i < itemCount; i++) {
    const type = formData.get(`items[${i}].type`) as string;
    const label = formData.get(`items[${i}].label`) as string;
    const amount_krw = Number(formData.get(`items[${i}].amount_krw`) ?? "0");
    if (amount_krw > 0) {
      items.push({ type, label, amount_krw });
    }
  }

  if (items.length === 0) {
    return { success: false, error: "청구 항목이 없습니다." };
  }

  // Parse payment amounts
  const usdAmount = Number(formData.get("usd_amount") ?? "0");
  const usdRate = Number(formData.get("usd_rate") ?? "0");
  const usdInKrw = Number(formData.get("usd_in_krw") ?? "0");
  const krwAmount = Number(formData.get("krw_amount") ?? "0");
  // Determine currency
  let currencyPaid = "KRW";
  if (usdAmount > 0 && krwAmount > 0) {
    currencyPaid = "KRW"; // mixed → normalize to KRW
  } else if (usdAmount > 0) {
    currencyPaid = "USD";
  }

  // Build notes with payment breakdown
  const parts: string[] = [];
  if (usdAmount > 0) {
    parts.push(
      `[USD] $${usdAmount.toLocaleString()} @₩${usdRate.toLocaleString()} = ₩${usdInKrw.toLocaleString()}`,
    );
  }
  if (krwAmount > 0) {
    parts.push(`[KRW] ₩${krwAmount.toLocaleString()}`);
  }
  if (notes) parts.push(notes);
  const paymentNotes = parts.join(" | ") || null;

  // Find exchange rate id for today's $100 rate
  let exchangeRateId: number | null = null;
  if (usdAmount > 0) {
    const rateRow = await db
      .selectFrom("exchange_rate")
      .select("id")
      .where("denomination", "=", 100)
      .where("date", "=", payment_date)
      .executeTakeFirst();
    exchangeRateId = rateRow?.id ?? null;
  }

  // Create one payment record per line item (in a transaction for atomicity)
  // When multiple items are created together, share a bundle_id
  const bundleId = items.length > 1 ? crypto.randomUUID() : null;

  // For a USD bundle, the single USD payment covers every line; split it across
  // lines proportionally to each line's KRW amount so the per-line amount_paid
  // sums back to exactly the USD total (instead of N× the total on every line).
  const paidPerLine =
    currencyPaid === "USD"
      ? allocateProportional(
          usdAmount,
          items.map((it) => it.amount_krw),
        )
      : items.map((it) => it.amount_krw);

  await db.transaction().execute(async (trx) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const paymentType =
        item.type === "rent"
          ? "rent"
          : item.type === "utility"
            ? "utility"
            : "service";

      await trx
        .insertInto("payment")
        .values({
          lease_id,
          payment_type: paymentType,
          billing_month,
          amount_krw: String(item.amount_krw),
          currency_paid: currencyPaid,
          amount_paid: String(paidPerLine[i]),
          exchange_rate_id: exchangeRateId,
          payment_method,
          payment_date,
          status: "paid",
          notes: paymentNotes,
          received_by: Number(session.user.id),
          bundle_id: bundleId,
        })
        .execute();
    }
  });

  revalidatePath("/payments");
  return { success: true, error: null };
}

export async function addPaymentUtilityType(name: string) {
  const session = await getSession();
  if (!session?.user?.id || !isStaffOrAdmin(session.user.role)) {
    return null;
  }

  if (!name.trim()) return null;

  const db = getDb();

  // utility_type.name is UNIQUE — return the existing row instead of throwing
  const existing = await db
    .selectFrom("utility_type")
    .select(["id", "name"])
    .where("name", "=", name.trim())
    .executeTakeFirst();
  if (existing) return existing;

  const result = await db
    .insertInto("utility_type")
    .values({ name: name.trim(), is_default: false })
    .returning(["id", "name"])
    .executeTakeFirst();

  revalidatePath("/settings");
  revalidatePath("/payments");

  return result ?? null;
}
