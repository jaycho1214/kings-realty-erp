import { getDb } from "@kingsrealty/db";
import { formatKRW } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import { SubmitButton } from "@/components/submit-button";
import { ArrowLeftRight } from "lucide-react";
import { seoulDateString, addDays } from "@/lib/date";
import { setExchangeRate } from "./_actions";

const DENOMINATIONS = [100, 50, 20, 10, 5, 1] as const;

export default async function ExchangeRatePage() {
  const db = getDb();

  // Asia/Seoul calendar date, so "today" matches the dashboard and the user's
  // local date regardless of server timezone.
  const today = seoulDateString();
  const thirtyDaysAgoStr = addDays(today, -30);

  const [todayRates, recentRates] = await Promise.all([
    db
      .selectFrom("exchange_rate")
      .select(["denomination", "usd_to_krw", "set_by", "updated_at"])
      .where("date", "=", new Date(today))
      .orderBy("denomination", "desc")
      .execute(),
    db
      .selectFrom("exchange_rate")
      .select([
        "id",
        "date",
        "denomination",
        "usd_to_krw",
        "set_by",
        "created_at",
      ])
      .where("date", ">=", new Date(thirtyDaysAgoStr))
      .orderBy("date", "desc")
      .orderBy("denomination", "desc")
      .execute(),
  ]);

  // Build a map for today's rates by denomination
  const todayRateMap = new Map<number, string>();
  for (const r of todayRates) {
    todayRateMap.set(r.denomination, r.usd_to_krw);
  }

  // Group recent rates by date
  const ratesByDate = new Map<string, Map<number, string>>();
  for (const r of recentRates) {
    const dateStr = new Date(r.date).toISOString().split("T")[0];
    if (!ratesByDate.has(dateStr)) {
      ratesByDate.set(dateStr, new Map());
    }
    ratesByDate.get(dateStr)!.set(r.denomination, r.usd_to_krw);
  }

  const sortedDates = Array.from(ratesByDate.keys()).sort((a, b) =>
    b.localeCompare(a),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="환율"
        description="권종별 USD → KRW 환율을 날짜별로 관리합니다."
      />

      {/* Today's rates display */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            오늘의 환율 (USD → KRW)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {DENOMINATIONS.map((denom) => (
              <div
                key={denom}
                className="rounded-lg bg-muted/40 p-3 text-center"
              >
                <p className="tabular text-xs text-muted-foreground">
                  ${denom}
                </p>
                <p className="mt-1 text-lg font-semibold tracking-tight">
                  {todayRateMap.has(denom) ? (
                    <span className="tabular">
                      {formatKRW(todayRateMap.get(denom)!)}
                    </span>
                  ) : (
                    <span className="text-sm font-normal text-muted-foreground">
                      미등록
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Set rate form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">환율 등록</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={setExchangeRate} className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="date">
                  날짜 <span className="text-danger">*</span>
                </Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={today}
                  required
                />
              </div>
              <SubmitButton label="등록" />
            </div>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {DENOMINATIONS.map((denom) => (
                <div key={denom} className="space-y-1.5">
                  <Label htmlFor={`rate_${denom}`} className="tabular">
                    ${denom}
                  </Label>
                  <Input
                    id={`rate_${denom}`}
                    name={`rate_${denom}`}
                    type="number"
                    step="0.01"
                    placeholder="₩"
                    defaultValue={todayRateMap.get(denom) ?? ""}
                  />
                </div>
              ))}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recent rates table */}
      <DataPanel>
        {sortedDates.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="등록된 환율이 없습니다"
            description="위에서 오늘의 환율을 등록해 보세요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                {DENOMINATIONS.map((denom) => (
                  <TableHead key={denom} className="text-right">
                    ${denom}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDates.map((dateStr) => {
                const denomMap = ratesByDate.get(dateStr)!;
                return (
                  <TableRow key={dateStr}>
                    <TableCell className="tabular font-medium">
                      {new Date(dateStr).toLocaleDateString("ko-KR")}
                    </TableCell>
                    {DENOMINATIONS.map((denom) => (
                      <TableCell
                        key={denom}
                        className="tabular text-right text-muted-foreground"
                      >
                        {denomMap.has(denom)
                          ? formatKRW(denomMap.get(denom)!)
                          : "-"}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DataPanel>
    </div>
  );
}
