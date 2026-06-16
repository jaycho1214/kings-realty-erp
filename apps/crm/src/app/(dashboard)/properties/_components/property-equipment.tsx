"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { addEquipment, deleteEquipment } from "../_actions";

const PAID_BY_LABEL: Record<string, string> = {
  office: "사무실",
  tenant: "세입자",
  landlord: "집주인",
};

interface Equipment {
  id: number;
  name: string;
  paid_by: string;
  monthly_cost_krw: string | number;
  notes: string | null;
}

interface PropertyEquipmentProps {
  propertyId: number;
  equipment: Equipment[];
}

export function PropertyEquipment({
  propertyId,
  equipment,
}: PropertyEquipmentProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await addEquipment(propertyId, formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-3">
      <DataPanel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>장비명</TableHead>
              <TableHead>납부자</TableHead>
              <TableHead className="text-right">월비용(&#8361;)</TableHead>
              <TableHead>비고</TableHead>
              <TableHead className="w-[50px]">{""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipment.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  등록된 장비/설비가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              equipment.map((item) => {
                const deleteAction = deleteEquipment.bind(
                  null,
                  item.id,
                  propertyId,
                );
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {PAID_BY_LABEL[item.paid_by] ?? item.paid_by}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {Number(item.monthly_cost_krw) > 0
                        ? formatKRW(item.monthly_cost_krw)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.notes ?? "-"}
                    </TableCell>
                    <TableCell>
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
          <Input
            name="name"
            required
            placeholder="장비명 (예: 정수기, 인터넷)"
            className="w-44"
          />
          <select
            name="paid_by"
            required
            defaultValue=""
            className="h-8 w-28 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="" disabled>
              납부자
            </option>
            <option value="office">사무실</option>
            <option value="tenant">세입자</option>
            <option value="landlord">집주인</option>
          </select>
          <Input
            name="monthly_cost_krw"
            type="number"
            min={0}
            placeholder="월비용"
            className="w-28"
          />
          <Input name="notes" placeholder="비고" className="w-32" />
          <SubmitButton label="추가" />
        </form>
      </div>
    </div>
  );
}
