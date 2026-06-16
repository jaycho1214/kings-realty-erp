"use client";

import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { KRWValue } from "@/components/krw-value";
import { DataPanel } from "@/components/data-panel";
import { formatKRW } from "@/lib/utils";
import { seoulDateString, seoulYMD } from "@/lib/date";
import { createLandlordSettlement } from "../../_actions";

interface LandlordSettlementsProps {
  landlordId: number;
  landlordName: string;
  monthlyRentTotal: number;
  paidThisMonth: number;
  recentSettlements: {
    id: number;
    amount_krw: string | number;
    description: string | null;
    entry_date: Date | string;
    created_at: Date | string;
  }[];
}

export function LandlordSettlements({
  landlordId,
  monthlyRentTotal,
  paidThisMonth,
  recentSettlements,
}: LandlordSettlementsProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const balance = monthlyRentTotal - paidThisMonth;
  const { year, month } = seoulYMD();
  const currentMonth = `${year}년 ${month}월`;
  const todayStr = seoulDateString();
  const boundAction = createLandlordSettlement.bind(null, landlordId);

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      await boundAction(formData);
      formRef.current?.reset();
    });
  };

  return (
    <div className="space-y-6">
      {/* Monthly Summary */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          {currentMonth} 정산 현황
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Card size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">총 임대료</p>
              <KRWValue
                value={formatKRW(monthlyRentTotal)}
                className="tabular mt-0.5 truncate text-lg font-semibold"
              />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">정산 완료</p>
              <KRWValue
                value={formatKRW(paidThisMonth)}
                className="tabular mt-0.5 truncate text-lg font-semibold text-success"
              />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">잔액</p>
              <KRWValue
                value={formatKRW(balance)}
                className={`tabular mt-0.5 truncate text-lg font-semibold ${balance > 0 ? "text-danger" : ""}`}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Record Settlement Form */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          정산 등록
        </h3>
        <Card>
          <CardContent className="p-4">
            <form
              ref={formRef}
              action={handleSubmit}
              className="flex flex-wrap items-end gap-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="settlement-amount">금액 (원)</Label>
                <Input
                  id="settlement-amount"
                  name="amount"
                  type="number"
                  required
                  defaultValue={balance > 0 ? balance : monthlyRentTotal}
                  className="w-40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settlement-date">날짜</Label>
                <Input
                  id="settlement-date"
                  name="date"
                  type="date"
                  required
                  defaultValue={todayStr}
                  className="w-40"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="settlement-desc">설명</Label>
                <Input
                  id="settlement-desc"
                  name="description"
                  defaultValue={`임대인 정산 - ${currentMonth}`}
                  className="w-full"
                />
              </div>
              <Button type="submit" disabled={isPending}>
                {isPending ? "등록 중..." : "정산 등록"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Settlement History */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          정산 내역
        </h3>
        <DataPanel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>설명</TableHead>
                <TableHead>등록일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentSettlements.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    정산 내역이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                recentSettlements.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="tabular font-medium">
                      {new Date(entry.entry_date).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatKRW(Number(entry.amount_krw))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.description ?? "-"}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DataPanel>
      </div>
    </div>
  );
}
