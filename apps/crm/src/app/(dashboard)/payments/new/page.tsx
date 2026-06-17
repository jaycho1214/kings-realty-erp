import { getDb, sql } from "@kingsrealty/db";
import { seoulDateString } from "@/lib/date";
import { PaymentCollector } from "./_components/payment-collector";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ lease?: string }>;
}) {
  const { lease: leaseParam } = await searchParams;
  const db = getDb();

  // Asia/Seoul calendar date, so "today" matches the rate stored by the
  // exchange-rate action regardless of the server's (UTC) timezone.
  const today = seoulDateString();

  const [leases, exchangeRates, billPresets, openCharges] = await Promise.all([
    db
      .selectFrom("lease")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "lease.id",
        "lease.monthly_rent_krw",
        "tenant.name as tenant_name",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "property_address",
        ),
      ])
      .where("lease.status", "=", "active")
      .orderBy("tenant.name", "asc")
      .execute(),
    db
      .selectFrom("exchange_rate")
      .select(["id", "denomination", "usd_to_krw"])
      .where("date", "=", new Date(today))
      .orderBy("denomination", "desc")
      .execute(),
    db
      .selectFrom("bill_preset")
      .select(["id", "label", "type"])
      .orderBy("sort_order", "asc")
      .execute(),
    // Unpaid, amount-known charges on active leases — the collector offers
    // these as one-click line items that settle the charge on save.
    db
      .selectFrom("charge_item")
      .innerJoin("lease", "lease.id", "charge_item.lease_id")
      .select([
        "charge_item.id",
        "charge_item.lease_id",
        "charge_item.type",
        "charge_item.memo",
        "charge_item.amount",
        "charge_item.currency",
        "charge_item.billing_month",
        "charge_item.status",
      ])
      .where("lease.status", "=", "active")
      .where("charge_item.paid_by_payment_id", "is", null)
      .where("charge_item.amount", "is not", null)
      .where("charge_item.status", "in", ["billed", "overdue"])
      .orderBy("charge_item.billing_month", "asc")
      .execute(),
  ]);

  const serializedLeases = leases.map((l) => ({
    id: l.id,
    tenant_name: l.tenant_name,
    property_address: l.property_address,
    monthly_rent_krw: Number(l.monthly_rent_krw),
  }));

  const serializedRates = exchangeRates.map((r) => ({
    id: r.id,
    denomination: Number(r.denomination),
    usd_to_krw: Number(r.usd_to_krw),
  }));

  const typeKo: Record<string, string> = {
    rent: "월세",
    utility: "공과금",
    management: "관리비",
    parking: "주차",
    deposit: "보증금",
    realty_fee: "중개수수료",
  };

  const openChargesByLease: Record<
    number,
    {
      id: number;
      type: string;
      label: string;
      amount: number;
      currency: string;
      billing_month: string;
      status: string;
    }[]
  > = {};
  for (const c of openCharges) {
    if (c.lease_id == null) continue;
    (openChargesByLease[c.lease_id] ??= []).push({
      id: c.id,
      type: c.type,
      label: c.memo ?? typeKo[c.type] ?? c.type,
      amount: Number(c.amount),
      currency: c.currency,
      billing_month: c.billing_month
        ? new Date(c.billing_month).toISOString().slice(0, 7)
        : "",
      status: c.status,
    });
  }

  const defaultLeaseId = leaseParam ? Number(leaseParam) : undefined;

  return (
    <PaymentCollector
      leases={serializedLeases}
      exchangeRates={serializedRates}
      billPresets={billPresets}
      openChargesByLease={openChargesByLease}
      defaultLeaseId={defaultLeaseId}
    />
  );
}
