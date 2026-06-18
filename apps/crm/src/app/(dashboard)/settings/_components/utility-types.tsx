"use client";

import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
import {
  addUtilityType,
  updateUtilityType,
  deleteUtilityType,
} from "../_actions";

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
  const [editingId, setEditingId] = useState<number | null>(null);

  const addAction = async (formData: FormData) => {
    await addUtilityType(formData);
    formRef.current?.reset();
  };

  const saveAction = (id: number) => async (formData: FormData) => {
    await updateUtilityType(id, formData);
    setEditingId(null);
  };

  return (
    <div className="space-y-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>기본</TableHead>
            <TableHead>사용</TableHead>
            <TableHead className="w-[88px]">{""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.map((type) => {
            if (editingId === type.id) {
              return (
                <TableRow key={type.id}>
                  <TableCell colSpan={4} className="p-0">
                    <form
                      action={saveAction(type.id)}
                      className="flex items-end gap-2 p-2"
                    >
                      <Input
                        name="name"
                        required
                        defaultValue={type.name}
                        className="w-48"
                      />
                      <SubmitButton label="저장" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              );
            }
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
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="수정"
                      onClick={() => setEditingId(type.id)}
                    >
                      <Pencil className="size-4" />
                    </Button>
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
                  </div>
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
