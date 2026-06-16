"use client";

import { useRef } from "react";
import { Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SubmitButton } from "@/components/submit-button";
import { DataPanel } from "@/components/data-panel";
import { formatKRW } from "@/lib/utils";
import {
  addUtilityBill,
  deleteUtilityBill,
  markUtilityBillPaid,
} from "../../_actions";

interface UtilityBill {
  id: number;
  billing_month: Date;
  utility_type_id: number;
  amount_krw: string | number;
  paid_to_company: boolean;
  paid_to_company_date: Date | null;
  bearer: string;
  payee: string | null;
  notes: string | null;
}

const bearerLabel: Record<string, string> = {
  tenant: "임차인",
  landlord: "임대인",
  office: "중개",
};

interface UtilityType {
  id: number;
  name: string;
}

interface UtilityBillsProps {
  leaseId: number;
  bills: UtilityBill[];
  utilityTypes: UtilityType[];
}

function formatMonth(date: Date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getTypeName(types: UtilityType[], typeId: number) {
  return types.find((t) => t.id === typeId)?.name ?? "-";
}

export function UtilityBills({
  leaseId,
  bills,
  utilityTypes,
}: UtilityBillsProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await addUtilityBill(leaseId, formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-3">
      <DataPanel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>청구월</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>부담</TableHead>
              <TableHead>수취인</TableHead>
              <TableHead className="text-right">금액(₩)</TableHead>
              <TableHead>납부여부</TableHead>
              <TableHead>납부일</TableHead>
              <TableHead className="w-[90px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  등록된 공과금이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              bills.map((bill) => {
                const deleteAction = deleteUtilityBill.bind(
                  null,
                  bill.id,
                  leaseId,
                );
                const markPaidAction = markUtilityBillPaid.bind(
                  null,
                  bill.id,
                  leaseId,
                );
                return (
                  <TableRow key={bill.id}>
                    <TableCell className="tabular font-medium">
                      {formatMonth(bill.billing_month)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getTypeName(utilityTypes, bill.utility_type_id)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {bearerLabel[bill.bearer] ?? bill.bearer}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {bill.payee ?? "-"}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatKRW(bill.amount_krw)}
                    </TableCell>
                    <TableCell>
                      {bill.paid_to_company ? (
                        <Badge>납부완료</Badge>
                      ) : (
                        <Badge variant="secondary">미납</Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {bill.paid_to_company_date
                        ? new Date(
                            bill.paid_to_company_date,
                          ).toLocaleDateString("ko-KR")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!bill.paid_to_company && (
                          <form action={markPaidAction}>
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-success"
                              aria-label="납부 처리"
                            >
                              <Check className="size-4" />
                            </Button>
                          </form>
                        )}
                        <form action={deleteAction}>
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-danger"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </DataPanel>
      <div className="rounded-xl bg-muted/40 p-3">
        <form
          ref={formRef}
          action={addAction}
          className="flex flex-wrap items-end gap-3"
        >
          <Input name="billing_month" type="month" required className="w-40" />
          <select
            name="utility_type_id"
            required
            defaultValue=""
            className="h-8 w-32 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="" disabled>
              유형 선택
            </option>
            {utilityTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          <Input
            name="amount_krw"
            type="number"
            required
            min={0}
            placeholder="금액"
            className="w-28"
          />
          <select
            name="bearer"
            defaultValue="tenant"
            className="h-8 w-28 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="tenant">임차인 부담</option>
            <option value="landlord">임대인 부담</option>
            <option value="office">중개 부담</option>
          </select>
          <Input name="payee" placeholder="수취인" className="w-28" />
          <Input name="notes" placeholder="비고" className="w-28" />
          <SubmitButton label="추가" />
        </form>
      </div>
    </div>
  );
}
