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

/** Payment-type categories stored verbatim; others normalize to "service". */
const KNOWN_PAYMENT_TYPES = new Set([
  "rent",
  "utility",
  "deposit",
  "service",
  "management",
  "parking",
]);

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

  // Parse line items. A line may carry `charge_id` when it was added from the
  // tenant's open charges — that charge is settled (수납완료) by this payment.
  const itemCount = Number(formData.get("item_count") ?? "0");
  const items: {
    type: string;
    label: string;
    amount_krw: number;
    charge_id: number | null;
  }[] = [];
  for (let i = 0; i < itemCount; i++) {
    const type = formData.get(`items[${i}].type`) as string;
    const label = formData.get(`items[${i}].label`) as string;
    const amount_krw = Number(formData.get(`items[${i}].amount_krw`) ?? "0");
    const chargeIdRaw = formData.get(`items[${i}].charge_id`) as string | null;
    const charge_id = chargeIdRaw ? Number(chargeIdRaw) : null;
    if (amount_krw > 0) {
      items.push({ type, label, amount_krw, charge_id });
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
    currencyPaid = "MIXED"; // hybrid USD + KRW tender (breakdown kept in notes)
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
      // Keep the line's own type when it's a known category (so 관리비/주차 etc.
      // carry through from a charge); fall back to "service" for ad-hoc lines.
      const paymentType = KNOWN_PAYMENT_TYPES.has(item.type)
        ? item.type
        : "service";

      const inserted = await trx
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
        .returning("id")
        .executeTakeFirstOrThrow();

      // Settle the linked charge (binary — no partial). Guard on lease_id so a
      // stale/foreign charge id can't be flipped.
      if (item.charge_id) {
        await trx
          .updateTable("charge_item")
          .set({
            paid_by_payment_id: inserted.id,
            status: "paid",
            updated_at: new Date(),
          })
          .where("id", "=", item.charge_id)
          .where("lease_id", "=", lease_id)
          .execute();
      }
    }
  });

  revalidatePath("/payments");
  revalidatePath("/"); // dashboard 미납 board reads charges
  return { success: true, error: null };
}

/**
 * Add a bill/payment type to the shared `bill_preset` catalog from the payment
 * collector (inline "+ 새 유형"). Dedupes by label. `type` is the stable key
 * stored on payments/charges; for ad-hoc additions we use the label itself so
 * it displays correctly without a hard catalog link.
 */
export async function addBillPreset(label: string) {
  const session = await getSession();
  if (!session?.user?.id || !isStaffOrAdmin(session.user.role)) {
    return null;
  }
  const trimmed = label.trim();
  if (!trimmed) return null;

  const db = getDb();
  const existing = await db
    .selectFrom("bill_preset")
    .select(["id", "label", "type"])
    .where("label", "=", trimmed)
    .executeTakeFirst();
  if (existing) return existing;

  const maxOrder = await db
    .selectFrom("bill_preset")
    .select(({ fn }) => fn.max("sort_order").as("m"))
    .executeTakeFirst();

  const result = await db
    .insertInto("bill_preset")
    .values({
      label: trimmed,
      type: trimmed, // ad-hoc key = label (no canonical category)
      is_variable: false,
      sort_order: Number(maxOrder?.m ?? 0) + 1,
    })
    .returning(["id", "label", "type"])
    .executeTakeFirst();

  revalidatePath("/settings");
  revalidatePath("/payments/new");
  return result ?? null;
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
