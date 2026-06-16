"use client";

import Link from "next/link";
import { ArrowRight, Plus, ListFilter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export type BoardItem = {
  id: number;
  typeKey: string;
  typeLabel: string;
  amount: string;
  who: string;
  address: string;
  dateLabel: string;
};

export type ListItem = {
  id: number;
  typeLabel: string;
  who: string;
  whoId: number;
  address: string;
  amount: string;
  status: string;
  statusLabel: string;
};

const typeColor: Record<string, string> = {
  rent: "text-brand",
  deposit: "text-success",
  utility: "text-warning",
  service: "text-muted-foreground",
};

function Column({
  title,
  dot,
  items,
  last,
}: {
  title: string;
  dot: string;
  items: BoardItem[];
  last?: boolean;
}) {
  return (
    <div className={cn("p-3", !last && "border-b md:border-b-0 md:border-r")}>
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
        <span className={cn("size-2 rounded-full", dot)} />
        {title}
        <span className="tabular text-[12px] font-medium text-muted-foreground">
          {items.length}
        </span>
        <Link
          href="/payments/new"
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">
          항목 없음
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((p) => (
            <Link key={p.id} href={`/payments/${p.id}`}>
              <Card className="gap-1.5 rounded-lg p-2.5 transition hover:ring-brand/40">
                <div className="flex items-center justify-between">
                  <span className="tabular text-[11px] text-muted-foreground">
                    #{p.id}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-5 px-1.5 text-[11px]",
                      typeColor[p.typeKey],
                    )}
                  >
                    {p.typeLabel}
                  </Badge>
                </div>
                <div className="text-[14px] font-semibold">{p.who}</div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {p.address}
                </div>
                <div className="tabular text-[14px] font-semibold">
                  {p.amount}
                </div>
                <div className="mt-0.5 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                  <span className="tabular">{p.dateLabel}</span>
                  <ArrowRight className="size-3" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function PaymentBoard({
  pending,
  overdue,
  paid,
  list,
}: {
  pending: BoardItem[];
  overdue: BoardItem[];
  paid: BoardItem[];
  list: ListItem[];
}) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <Tabs defaultValue="board" className="gap-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <TabsList variant="line">
            <TabsTrigger value="board">보드</TabsTrigger>
            <TabsTrigger value="list">목록</TabsTrigger>
          </TabsList>
          <Link
            href="/payments"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ListFilter className="size-3.5" />
            필터
          </Link>
        </div>

        <TabsContent value="board">
          <div className="grid md:grid-cols-3">
            <Column title="미납" dot="bg-warning" items={pending} />
            <Column title="연체" dot="bg-danger" items={overdue} />
            <Column title="완료" dot="bg-success" items={paid} last />
          </div>
        </TabsContent>

        <TabsContent value="list">
          {list.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              수납 내역이 없습니다
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>세입자</TableHead>
                  <TableHead>매물</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/tenants/${p.whoId}`}
                        className="hover:underline"
                      >
                        {p.who}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.address}
                    </TableCell>
                    <TableCell>{p.typeLabel}</TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {p.amount}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} label={p.statusLabel} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
