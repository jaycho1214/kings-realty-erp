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
import {
  createBaseLocation,
  deleteBaseLocation,
} from "@/app/(dashboard)/tenants/_actions";

interface BaseLocationRow {
  id: number;
  name: string;
  name_ko: string | null;
  sort_order: number;
}

interface BaseLocationsProps {
  locations: BaseLocationRow[];
  usageMap: Record<string, number>;
}

export function BaseLocations({ locations, usageMap }: BaseLocationsProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await createBaseLocation(formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름 (영문)</TableHead>
            <TableHead>이름 (한글)</TableHead>
            <TableHead>사용</TableHead>
            <TableHead className="w-[60px]">{""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.map((loc) => {
            const count = usageMap[loc.id] ?? 0;
            const canDelete = count === 0;
            const handleDelete = deleteBaseLocation.bind(null, loc.id);
            return (
              <TableRow key={loc.id}>
                <TableCell className="font-medium">{loc.name}</TableCell>
                <TableCell>{loc.name_ko || "-"}</TableCell>
                <TableCell className="tabular-nums">
                  {count > 0 ? `${count}명` : "-"}
                </TableCell>
                <TableCell>
                  <form action={handleDelete}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-danger"
                      disabled={!canDelete}
                      aria-label={
                        !canDelete ? `${count}명의 세입자가 사용 중` : "삭제"
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="border-t p-3">
        <form ref={formRef} action={addAction} className="flex items-end gap-3">
          <Input
            name="name"
            required
            placeholder="기지 이름 (영문)"
            className="w-40"
          />
          <Input name="name_ko" placeholder="한글 이름" className="w-40" />
          <SubmitButton label="추가" />
        </form>
      </div>
    </div>
  );
}
