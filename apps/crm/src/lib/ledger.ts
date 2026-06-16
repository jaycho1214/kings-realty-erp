import { getDb } from "@kingsrealty/db";
import { seoulDateString } from "@/lib/date";

export interface LedgerRow {
  key: string;
  date: string; // YYYY-MM-DD
  direction: "receipt" | "disbursement";
  type: string;
  currency: string | null;
  denomination: number | null;
  exchangeRate: number | null;
  vendor: string | null;
  krw: number;
  memo: string | null;
  source: "payment" | "utility" | "manual";
  manualId: number | null;
  balance: number;
}

export interface TenantLedger {
  rows: LedgerRow[];
  totalReceipts: number;
  totalDisbursements: number;
  balance: number;
}

function toDate(value: Date | string | null | undefined): string {
  if (!value) return seoulDateString();
  return seoulDateString(value instanceof Date ? value : new Date(value));
}

/**
 * The tenant 원장(ledger): a single chronological view of every won that came
 * in (receipts = collected payments + manual receipts) and went out
 * (disbursements = paid utility bills + manual disbursements), with a running
 * KRW balance. This is the backbone view per the C1 decision.
 */
export async function buildTenantLedger(
  tenantId: number,
): Promise<TenantLedger> {
  const db = getDb();

  const [payments, bills, manual] = await Promise.all([
    db
      .selectFrom("payment")
      .innerJoin("lease", "lease.id", "payment.lease_id")
      .leftJoin(
        "exchange_vendor",
        "exchange_vendor.id",
        "payment.exchange_vendor_id",
      )
      .leftJoin("exchange_rate", "exchange_rate.id", "payment.exchange_rate_id")
      .select([
        "payment.id as id",
        "payment.payment_date as date",
        "payment.payment_type as type",
        "payment.currency_paid as currency",
        "payment.denomination as denomination",
        "payment.amount_krw as amount_krw",
        "exchange_rate.usd_to_krw as rate",
        "exchange_vendor.name as vendor",
        "payment.notes as memo",
      ])
      .where("lease.tenant_id", "=", tenantId)
      .where("payment.status", "=", "paid")
      .execute(),
    db
      .selectFrom("utility_bill")
      .innerJoin("lease", "lease.id", "utility_bill.lease_id")
      .innerJoin(
        "utility_type",
        "utility_type.id",
        "utility_bill.utility_type_id",
      )
      .select([
        "utility_bill.id as id",
        "utility_bill.paid_to_company_date as paid_date",
        "utility_bill.billing_month as billing_month",
        "utility_type.name as type",
        "utility_bill.amount_krw as amount_krw",
        "utility_bill.notes as memo",
      ])
      .where("lease.tenant_id", "=", tenantId)
      .where("utility_bill.paid_to_company", "=", true)
      .execute(),
    db
      .selectFrom("ledger_entry")
      .leftJoin(
        "exchange_vendor",
        "exchange_vendor.id",
        "ledger_entry.exchange_vendor_id",
      )
      .select([
        "ledger_entry.id as id",
        "ledger_entry.entry_date as date",
        "ledger_entry.direction as direction",
        "ledger_entry.category as type",
        "ledger_entry.currency as currency",
        "ledger_entry.denomination as denomination",
        "ledger_entry.exchange_rate as rate",
        "exchange_vendor.name as vendor",
        "ledger_entry.amount_krw as amount_krw",
        "ledger_entry.description as memo",
      ])
      .where("ledger_entry.tenant_id", "=", tenantId)
      .execute(),
  ]);

  const rows: Omit<LedgerRow, "balance">[] = [];

  for (const p of payments) {
    rows.push({
      key: `p-${p.id}`,
      date: toDate(p.date),
      direction: "receipt",
      type: String(p.type),
      currency: p.currency,
      denomination: p.denomination,
      exchangeRate: p.rate != null ? Number(p.rate) : null,
      vendor: p.vendor,
      krw: Number(p.amount_krw),
      memo: p.memo,
      source: "payment",
      manualId: null,
    });
  }
  for (const b of bills) {
    rows.push({
      key: `u-${b.id}`,
      date: toDate(b.paid_date ?? b.billing_month),
      direction: "disbursement",
      type: String(b.type),
      currency: "KRW",
      denomination: null,
      exchangeRate: null,
      vendor: null,
      krw: Number(b.amount_krw),
      memo: b.memo,
      source: "utility",
      manualId: null,
    });
  }
  for (const m of manual) {
    rows.push({
      key: `l-${m.id}`,
      date: toDate(m.date),
      direction: m.direction === "disbursement" ? "disbursement" : "receipt",
      type: String(m.type),
      currency: m.currency,
      denomination: m.denomination,
      exchangeRate: m.rate != null ? Number(m.rate) : null,
      vendor: m.vendor,
      krw: Number(m.amount_krw),
      memo: m.memo,
      source: "manual",
      manualId: m.id,
    });
  }

  // Ascending by date → compute running balance, then present newest-first.
  rows.sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const withBalance: LedgerRow[] = rows.map((r) => {
    running += r.direction === "receipt" ? r.krw : -r.krw;
    return { ...r, balance: running };
  });
  withBalance.reverse();

  const totalReceipts = rows
    .filter((r) => r.direction === "receipt")
    .reduce((s, r) => s + r.krw, 0);
  const totalDisbursements = rows
    .filter((r) => r.direction === "disbursement")
    .reduce((s, r) => s + r.krw, 0);

  return {
    rows: withBalance,
    totalReceipts,
    totalDisbursements,
    balance: totalReceipts - totalDisbursements,
  };
}
