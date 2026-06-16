"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { addExchangeVendor, deleteExchangeVendor } from "../_actions";

interface ExchangeVendorRow {
  id: number;
  name: string;
  denominations: string | null;
  default_rate: string | null;
  phone: string | null;
}

export function ExchangeVendors({ vendors }: { vendors: ExchangeVendorRow[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await addExchangeVendor(formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>취급 권종</TableHead>
            <TableHead className="text-right">기본 환율</TableHead>
            <TableHead>연락처</TableHead>
            <TableHead className="w-[60px]">{""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.map((v) => {
            const deleteAction = deleteExchangeVendor.bind(null, v.id);
            return (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {v.denominations
                    ? v.denominations
                        .split(",")
                        .map((d) => `$${d.trim()}`)
                        .join(", ")
                    : "-"}
                </TableCell>
                <TableCell className="tabular text-right text-muted-foreground">
                  {v.default_rate
                    ? `₩${Number(v.default_rate).toLocaleString()}`
                    : "-"}
                </TableCell>
                <TableCell className="tabular text-muted-foreground">
                  {v.phone ?? "-"}
                </TableCell>
                <TableCell>
                  <form action={deleteAction}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="비활성화"
                    >
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <form
        ref={formRef}
        action={addAction}
        className="grid grid-cols-2 gap-2 border-t border-border/60 p-3 lg:grid-cols-5"
      >
        <Input name="name" placeholder="이름" required />
        <Input name="denominations" placeholder="권종 (예: 100,50)" />
        <Input name="default_rate" type="number" placeholder="기본 환율" />
        <Input name="phone" placeholder="연락처" />
        <SubmitButton label="추가" />
      </form>
    </div>
  );
}
