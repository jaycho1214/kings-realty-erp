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

  // Parse payment amounts. USD is split by denomination: $100 bills at the $100
  // rate, $20-and-under at the $20 rate (the "rest follows $20" rule).
  const usd100 = Number(formData.get("usd100_amount") ?? "0");
  const usd100Rate = Number(formData.get("usd100_rate") ?? "0");
  const usd20 = Number(formData.get("usd20_amount") ?? "0");
  const usd20Rate = Number(formData.get("usd20_rate") ?? "0");
  const usdAmount = usd100 + usd20;
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
  if (usd100 > 0) {
    parts.push(
      `[USD $100] $${usd100.toLocaleString()} @₩${usd100Rate.toLocaleString()}`,
    );
  }
  if (usd20 > 0) {
    parts.push(
      `[USD 기타] $${usd20.toLocaleString()} @₩${usd20Rate.toLocaleString()}`,
    );
  }
  if (usdAmount > 0) {
    parts.push(`[USD→₩] ${usdInKrw.toLocaleString()}`);
  }
  if (krwAmount > 0) {
    parts.push(`[KRW] ₩${krwAmount.toLocaleString()}`);
  }
  if (notes) parts.push(notes);
  const paymentNotes = parts.join(" | ") || null;

  // Reference the rate row for the payment's date (prefer the $100
  // denomination). If the day's rate was never registered, auto-register
  // whatever rate(s) the staff just entered so the first USD payment of the day
  // seeds it — only filling the gap (doNothing on conflict), never overwriting
  // an admin-set rate.
  let exchangeRateId: number | null = null;
  if (usdAmount > 0) {
    const payment_date_str = formData.get("payment_date") as string;
    const ratesToRegister: { denomination: number; rate: number }[] = [];
    if (usd100 > 0 && usd100Rate > 0) {
      ratesToRegister.push({ denomination: 100, rate: usd100Rate });
    }
    if (usd20 > 0 && usd20Rate > 0) {
      ratesToRegister.push({ denomination: 20, rate: usd20Rate });
    }

    for (const r of ratesToRegister) {
      await db
        .insertInto("exchange_rate")
        .values({
          date: payment_date_str,
          denomination: r.denomination,
          usd_to_krw: r.rate,
          set_by: Number(session.user.id),
        })
        .onConflict((oc) => oc.columns(["date", "denomination"]).doNothing())
        .execute();
    }
    if (ratesToRegister.length > 0) revalidatePath("/exchange-rate");

    const rateRow = await db
      .selectFrom("exchange_rate")
      .select("id")
      .where("date", "=", payment_date)
      .where("denomination", "in", [100, 20])
      .orderBy("denomination", "desc") // prefer the $100 row when both exist
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
      // Store the picked catalog type verbatim — bill_preset is the source of
      // truth, so any type filters/labels correctly without a code-level cap.
      const inserted = await trx
        .insertInto("payment")
        .values({
          lease_id,
          payment_type: item.type,
          label: item.label?.trim() || null, // specific line item (전기요금/수도요금/관리비…)
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
      // stale/foreign charge id can't be flipped, and on paid_by_payment_id IS
      // NULL so a charge already settled by another payment isn't re-linked —
      // which would orphan the first payment under a concurrent double-submit.
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
          .where("paid_by_payment_id", "is", null)
          .execute();
      }
    }
  });

  revalidatePath("/payments");
  revalidatePath("/"); // dashboard 미납 board reads charges
  return { success: true, error: null };
}

/**
 * Add a payment/charge type to the shared `bill_preset` catalog from the payment
 * collector (inline "+ 새 유형"). One row per `type` (the stable key stored on
 * payments/charges); ad-hoc additions use the label as the type so a new type is
 * immediately filterable and labelled with no code change.
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
    .where("type", "=", trimmed)
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
      type: trimmed, // ad-hoc key = label (its own filterable category)
      is_variable: false,
      variant: "outline",
      is_builtin: false,
      sort_order: Number(maxOrder?.m ?? 0) + 1,
    })
    .returning(["id", "label", "type"])
    .executeTakeFirst();

  revalidatePath("/settings");
  revalidatePath("/payments/new");
  return result ?? null;
}
