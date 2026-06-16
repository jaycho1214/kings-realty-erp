import { getDb } from "@kingsrealty/db";
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

  const [leases, exchangeRates, utilityTypes] = await Promise.all([
    db
      .selectFrom("lease")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "lease.id",
        "lease.monthly_rent_krw",
        "tenant.name as tenant_name",
        "property.address as property_address",
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
      .selectFrom("utility_type")
      .select(["id", "name"])
      .orderBy("name", "asc")
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

  const defaultLeaseId = leaseParam ? Number(leaseParam) : undefined;

  return (
    <PaymentCollector
      leases={serializedLeases}
      exchangeRates={serializedRates}
      utilityTypes={utilityTypes}
      defaultLeaseId={defaultLeaseId}
    />
  );
}
