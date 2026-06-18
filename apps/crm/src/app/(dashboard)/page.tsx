import Link from "next/link";
import { getDb, sql } from "@kingsrealty/db";
import {
  Wallet,
  CreditCard,
  Wrench,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatKRW, cn } from "@/lib/utils";
import { seoulYMD, daysUntil, seoulDateString } from "@/lib/date";
import { getUsdToKrwRate, toKrw } from "@/lib/exchange";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/authz";
import { ExchangeRateQuick } from "./_components/exchange-rate-quick";
import { TaskBoard } from "./_components/task-board";
import { loadBoardData } from "@/lib/tasks/queries";

type ChargeRow = {
  id: number;
  type: string;
  memo: string | null;
  amount: string | number | null;
  currency: string | null;
  billing_month: Date | string | null;
  due_date: Date | string | null;
  status: string;
  tenant_name: string;
  tenant_id: number;
  address: string;
};

export default async function DashboardPage() {
  const db = getDb();
  // "Today" and month boundaries in Asia/Seoul (the business timezone), so they
  // are correct regardless of the server's timezone (UTC on Vercel).
  const { year: sy, month: sm, day: sd } = seoulYMD();
  const today = new Date(sy, sm - 1, sd);
  const monthStart = new Date(sy, sm - 1, 1);
  const windowStart = new Date(sy, sm - 1 - 5, 1);
  const thirtyDays = new Date(today.getTime() + 30 * 864e5);
  const sixtyDays = new Date(today.getTime() + 60 * 864e5);

  const [
    payWindow,
    openCharges,
    serviceRows,
    expiringLeases,
    derosApproaching,
    todayRates,
    monthCharges,
    usdRate,
    board,
    session,
  ] = await Promise.all([
    db
      .selectFrom("payment")
      .innerJoin("lease", "lease.id", "payment.lease_id")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .select(["payment.billing_month", "payment.amount_krw", "payment.status"])
      .where("payment.billing_month", ">=", windowStart)
      .where("tenant.deleted_at", "is", null)
      .execute(),
    db
      .selectFrom("charge_item")
      .innerJoin("lease", "lease.id", "charge_item.lease_id")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "charge_item.id",
        "charge_item.type",
        "charge_item.memo",
        "charge_item.amount",
        "charge_item.currency",
        "charge_item.billing_month",
        "charge_item.due_date",
        "charge_item.status",
        "tenant.name as tenant_name",
        "tenant.id as tenant_id",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "address",
        ),
      ])
      .where("charge_item.paid_by_payment_id", "is", null)
      .where("charge_item.amount", "is not", null)
      .where("charge_item.status", "in", ["billed", "overdue"])
      .where("tenant.deleted_at", "is", null)
      .orderBy("charge_item.due_date", "asc")
      .execute(),
    db
      .selectFrom("service_request")
      .select(({ fn }) => ["status", fn.count<number>("id").as("cnt")])
      .where("status", "in", [
        "received",
        "pending_repair",
        "in_progress",
        "postponed",
      ])
      .groupBy("status")
      .execute(),
    db
      .selectFrom("lease")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "lease.id",
        "lease.end_date",
        "tenant.name as tenant_name",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "address",
        ),
      ])
      .where("lease.status", "in", ["active", "renewed"])
      .where("tenant.deleted_at", "is", null)
      .where("lease.end_date", ">=", today)
      .where("lease.end_date", "<=", thirtyDays)
      .orderBy("lease.end_date", "asc")
      .limit(5)
      .execute(),
    db
      .selectFrom("tenant")
      .select(["id", "name", "deros", "rank"])
      .where("status", "=", "active")
      .where("deleted_at", "is", null)
      .where("deros", ">=", today)
      .where("deros", "<=", sixtyDays)
      .orderBy("deros", "asc")
      .limit(5)
      .execute(),
    db
      .selectFrom("exchange_rate")
      .select(["denomination", "usd_to_krw"])
      .where("date", "=", today)
      .orderBy("denomination", "desc")
      .execute(),
    db
      .selectFrom("charge_item")
      .innerJoin("lease", "lease.id", "charge_item.lease_id")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .select([
        "charge_item.status",
        "charge_item.amount",
        "charge_item.currency",
      ])
      .where("charge_item.billing_month", "=", monthStart)
      .where("charge_item.amount", "is not", null)
      .where("tenant.deleted_at", "is", null)
      .execute(),
    getUsdToKrwRate(),
    // Independent of the queries above — fetch in the same wave instead of as
    // two extra serial round-trips after it.
    loadBoardData(),
    getSession(),
  ]);

  // Exchange-rate quick-entry (admin only): today's $100/$20 for the dashboard.
  const canSetRate = isAdmin(session?.user?.role);
  const todayStr = seoulDateString();
  const todayRateMap = new Map(
    todayRates.map((r) => [r.denomination, String(r.usd_to_krw)]),
  );

  // Monthly trend + current-month split
  const months = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(sy, sm - 1 - (5 - k), 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: `${d.getMonth() + 1}월`,
      expected: 0,
      collected: 0,
    };
  });
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  for (const p of payWindow) {
    const d = new Date(p.billing_month as Date);
    const amt = Number(p.amount_krw);
    const i = monthIdx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i != null) {
      months[i].expected += amt;
      if (p.status === "paid") months[i].collected += amt;
    }
  }

  // Current-month collection status from charges (what's owed), so it agrees
  // with the charge-based 미납 surfaces. 완료=수납, 미납=청구됨, 연체=마감 경과.
  let mDone = 0,
    mPending = 0,
    mOverdue = 0,
    collectedAmt = 0,
    expectedAmt = 0;
  for (const c of monthCharges) {
    const krw = toKrw(Number(c.amount ?? 0), c.currency ?? "KRW", usdRate);
    expectedAmt += krw;
    if (c.status === "paid") {
      mDone += 1;
      collectedAmt += krw;
    } else if (c.status === "overdue") {
      mOverdue += 1;
    } else {
      mPending += 1;
    }
  }
  const collectionRate =
    expectedAmt > 0 ? Math.round((collectedAmt / expectedAmt) * 100) : 0;

  // 미납 = 금액이 있는 미수납 청구(charge_item). USD 는 $20 환율로 환산해 합산.
  const charges = openCharges as ChargeRow[];
  const unpaidCount = charges.length;
  const unpaidAmt = charges.reduce(
    (sum, c) =>
      sum + toKrw(Number(c.amount ?? 0), c.currency ?? "KRW", usdRate),
    0,
  );
  const overdueOpen = charges.filter((c) => c.status === "overdue").length;

  // 미납 세입자 — 세입자별 미납 합계 상위.
  const arrearsByTenant = new Map<
    number,
    { name: string; amt: number; count: number }
  >();
  for (const c of charges) {
    const e = arrearsByTenant.get(c.tenant_id) ?? {
      name: c.tenant_name,
      amt: 0,
      count: 0,
    };
    e.amt += toKrw(Number(c.amount ?? 0), c.currency ?? "KRW", usdRate);
    e.count += 1;
    arrearsByTenant.set(c.tenant_id, e);
  }
  const arrearsTenants = [...arrearsByTenant.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 5);
  const svcReceived = Number(
    serviceRows.find((s) => s.status === "received")?.cnt ?? 0,
  );
  const svcProgress =
    Number(serviceRows.find((s) => s.status === "in_progress")?.cnt ?? 0) +
    Number(serviceRows.find((s) => s.status === "pending_repair")?.cnt ?? 0) +
    Number(serviceRows.find((s) => s.status === "postponed")?.cnt ?? 0);
  const svcOpen = serviceRows.reduce((sum, s) => sum + Number(s.cnt), 0);

  // Trend chart geometry
  const W = 320,
    H = 96,
    PAD = 8;
  const maxV = Math.max(...months.flatMap((m) => [m.expected, m.collected]), 1);
  const px = (i: number) => PAD + (i * (W - 2 * PAD)) / (months.length - 1);
  const py = (v: number) => H - PAD - (v / maxV) * (H - 2 * PAD);
  const expectedPts = months
    .map((m, i) => `${px(i).toFixed(0)},${py(m.expected).toFixed(0)}`)
    .join(" ");
  const collectedPts = months
    .map((m, i) => `${px(i).toFixed(0)},${py(m.collected).toFixed(0)}`)
    .join(" ");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">대시보드</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          오늘의 수납 현황과 미납·만료·DEROS를 한눈에.
        </p>
      </div>

      {/* 할 일 보드 */}
      <TaskBoard data={board} today={todayStr} layout="columns" />

      {/* Stat cards */}
      <div className="grid gap-3 lg:grid-cols-[1.15fr_0.95fr_1.5fr]">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[13px] font-semibold">
              <Wallet className="size-4 text-muted-foreground" />
              이번 달 수납
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-5">
              <Stat label="완료" dot="bg-success" value={mDone} />
              <Stat label="미납" dot="bg-warning" value={mPending} />
              <Stat label="연체" dot="bg-danger" value={mOverdue} />
            </div>
            <div className="flex h-[26px] gap-[3px] overflow-hidden rounded-md">
              {mDone + mPending + mOverdue === 0 ? (
                <span className="flex-1 bg-secondary" />
              ) : (
                <>
                  <span className="bg-success" style={{ flexGrow: mDone }} />
                  <span className="bg-warning" style={{ flexGrow: mPending }} />
                  <span className="bg-danger" style={{ flexGrow: mOverdue }} />
                </>
              )}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span className="tabular">{formatKRW(collectedAmt)} 수납</span>
              <span className="tabular">{collectionRate}%</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[13px] font-semibold">
                <CreditCard className="size-4 text-muted-foreground" />
                미납 합계
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="tabular text-2xl font-semibold leading-none">
                {formatKRW(unpaidAmt)}
              </div>
              <div className="mt-1.5 text-[12px] text-muted-foreground">
                <span className="tabular font-medium text-foreground">
                  {unpaidCount}건
                </span>{" "}
                미납
                {overdueOpen > 0 && (
                  <span className="text-danger"> · 연체 {overdueOpen}건</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[13px] font-semibold">
                <Wrench className="size-4 text-muted-foreground" />
                AS 진행중
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="tabular text-2xl font-semibold leading-none">
                {svcOpen}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  건
                </span>
              </div>
              <div className="tabular mt-1.5 text-[12px] text-muted-foreground">
                접수 {svcReceived} · 진행 {svcProgress}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[13px] font-semibold">
              <TrendingUp className="size-4 text-muted-foreground" />
              수납 추이
              <span className="text-[11px] font-normal text-muted-foreground">
                최근 6개월
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-24 w-full"
            >
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1="0"
                  y1={H * f}
                  x2={W}
                  y2={H * f}
                  className="stroke-border"
                  strokeWidth="1"
                />
              ))}
              <polyline
                fill="none"
                points={expectedPts}
                className="stroke-warning"
                strokeWidth="2"
                strokeDasharray="1 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                fill="none"
                points={collectedPts}
                className="stroke-brand"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="mt-2 flex justify-between">
              <div className="flex gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-0.5 w-3.5 rounded bg-brand" />
                  실수납
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-0.5 w-3.5 rounded bg-warning" />
                  예상
                </span>
              </div>
              <span className="tabular text-[10.5px] text-muted-foreground">
                {months[0].label}–{months[5].label}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary panels */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Panel title="미납 세입자" href="/payments">
          {arrearsTenants.length === 0 ? (
            <Empty>미납 없음</Empty>
          ) : (
            arrearsTenants.map((t) => (
              <Link
                key={t.id}
                href={`/tenants/${t.id}`}
                className="flex items-center justify-between px-3.5 py-2 text-[13px] hover:bg-secondary"
              >
                <span className="truncate">
                  {t.name}
                  <span className="ml-1.5 text-muted-foreground">
                    {t.count}건
                  </span>
                </span>
                <span className="tabular shrink-0 pl-2 font-medium text-danger">
                  {formatKRW(t.amt)}
                </span>
              </Link>
            ))
          )}
        </Panel>

        <Panel title="만료 예정 계약" meta="30일 이내" href="/notifications">
          {expiringLeases.length === 0 ? (
            <Empty>예정 없음</Empty>
          ) : (
            expiringLeases.map((l) => {
              const dleft = daysUntil(l.end_date);
              return (
                <Link
                  key={l.id}
                  href={`/leases/${l.id}`}
                  className="flex items-center justify-between px-3.5 py-2 text-[13px] hover:bg-secondary"
                >
                  <span className="truncate">
                    {l.tenant_name}{" "}
                    <span className="text-muted-foreground">{l.address}</span>
                  </span>
                  <span
                    className={cn(
                      "tabular shrink-0 pl-2",
                      dleft <= 14 ? "text-danger" : "text-muted-foreground",
                    )}
                  >
                    D-{dleft}
                  </span>
                </Link>
              );
            })
          )}
        </Panel>

        <Panel title="DEROS 임박" meta="60일 이내" href="/tenants">
          {derosApproaching.length === 0 ? (
            <Empty>예정 없음</Empty>
          ) : (
            derosApproaching.map((t) => {
              const dleft = daysUntil(t.deros as Date);
              return (
                <Link
                  key={t.id}
                  href={`/tenants/${t.id}`}
                  className="flex items-center justify-between px-3.5 py-2 text-[13px] hover:bg-secondary"
                >
                  <span className="truncate">
                    {t.name}
                    {t.rank && (
                      <span className="ml-1.5 text-muted-foreground">
                        {t.rank}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "tabular shrink-0 pl-2",
                      dleft <= 14 ? "text-danger" : "text-muted-foreground",
                    )}
                  >
                    D-{dleft}
                  </span>
                </Link>
              );
            })
          )}
        </Panel>

        <Panel title="오늘의 환율" href="/exchange-rate">
          {canSetRate ? (
            <ExchangeRateQuick
              today={todayStr}
              rate100={todayRateMap.get(100)}
              rate20={todayRateMap.get(20)}
            />
          ) : todayRates.length === 0 ? (
            <Empty>미등록</Empty>
          ) : (
            <div className="flex gap-6 px-3.5 py-3">
              {todayRates.slice(0, 3).map((r) => (
                <div key={r.denomination}>
                  <div className="tabular text-[11px] text-muted-foreground">
                    ${r.denomination}
                  </div>
                  <div className="tabular mt-0.5 text-base font-semibold">
                    {Number(r.usd_to_krw).toLocaleString("ko-KR", {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  label,
  dot,
  value,
}: {
  label: string;
  dot: string;
  value: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className={cn("size-[7px] rounded-full", dot)} />
        {label}
      </div>
      <div className="tabular mt-1 text-[22px] font-semibold leading-none">
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  meta,
  href,
  children,
}: {
  title: string;
  meta?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-3.5 py-2.5">
        <h2 className="text-[13px] font-semibold">
          {title}
          {meta && (
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              {meta}
            </span>
          )}
        </h2>
        {href && (
          <Link
            href={href}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="divide-y">{children}</div>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3.5 py-5 text-[12px] text-muted-foreground">{children}</p>
  );
}
