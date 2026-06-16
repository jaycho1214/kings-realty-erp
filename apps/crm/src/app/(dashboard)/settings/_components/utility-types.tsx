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
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { addUtilityType, deleteUtilityType } from "../_actions";

interface UtilityTypeRow {
  id: number;
  name: string;
  is_default: boolean;
  created_at: Date;
}

interface UtilityTypesProps {
  types: UtilityTypeRow[];
  usageMap: Record<string, number>;
}

export function UtilityTypes({ types, usageMap }: UtilityTypesProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await addUtilityType(formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>기본</TableHead>
            <TableHead>사용</TableHead>
            <TableHead>등록일</TableHead>
            <TableHead className="w-[60px]">{""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.map((type) => {
            const count = usageMap[type.id] ?? 0;
            const canDelete = !type.is_default && count === 0;
            const deleteAction = deleteUtilityType.bind(null, type.id);
            return (
              <TableRow key={type.id}>
                <TableCell className="font-medium">{type.name}</TableCell>
                <TableCell>{type.is_default && <Badge>기본</Badge>}</TableCell>
                <TableCell className="tabular-nums">
                  {count > 0 ? `${count}건` : "-"}
                </TableCell>
                <TableCell>
                  {new Date(type.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  {!type.is_default && (
                    <form action={deleteAction}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-danger"
                        disabled={!canDelete}
                        aria-label={
                          !canDelete
                            ? `${count}건의 청구서에서 사용 중`
                            : "삭제"
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </form>
                  )}
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
            placeholder="유형 이름"
            className="w-48"
          />
          <SubmitButton label="추가" />
        </form>
      </div>
    </div>
  );
}
