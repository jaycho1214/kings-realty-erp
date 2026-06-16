"use client";

import { useRef, useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
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
  addServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
} from "../_actions";

interface ServiceCategoryRow {
  id: number;
  value: string;
  label: string;
  is_default: boolean;
  sort_order: number;
  created_at: Date;
}

interface ServiceCategoriesProps {
  categories: ServiceCategoryRow[];
  usageMap: Record<string, number>;
}

export function ServiceCategories({
  categories,
  usageMap,
}: ServiceCategoriesProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const addAction = async (formData: FormData) => {
    await addServiceCategory(formData);
    formRef.current?.reset();
  };

  const startEdit = (cat: ServiceCategoryRow) => {
    setEditingId(cat.id);
    setEditLabel(cat.label);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
  };

  const saveEdit = async (id: number) => {
    const formData = new FormData();
    formData.set("label", editLabel);
    await updateServiceCategory(id, formData);
    setEditingId(null);
    setEditLabel("");
  };

  return (
    <div className="space-y-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>값 (value)</TableHead>
            <TableHead>표시 이름</TableHead>
            <TableHead>기본</TableHead>
            <TableHead>사용</TableHead>
            <TableHead className="w-[100px]">{""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((cat) => {
            const count = usageMap[cat.value] ?? 0;
            const canDelete = !cat.is_default && count === 0;
            const isEditing = editingId === cat.id;
            const deleteAction = deleteServiceCategory.bind(null, cat.id);

            return (
              <TableRow key={cat.id}>
                <TableCell className="font-medium font-mono">
                  {cat.value}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="h-7 w-32"
                        autoFocus
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-success"
                        onClick={() => saveEdit(cat.id)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={cancelEdit}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <span className="font-medium">{cat.label}</span>
                  )}
                </TableCell>
                <TableCell>{cat.is_default && <Badge>기본</Badge>}</TableCell>
                <TableCell className="tabular-nums">
                  {count > 0 ? `${count}건` : "-"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {!isEditing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(cat)}
                        aria-label="수정"
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {!cat.is_default && !isEditing && (
                      <form action={deleteAction}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-danger"
                          disabled={!canDelete}
                          aria-label={
                            !canDelete
                              ? `${count}건의 AS 요청에서 사용 중`
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
            name="value"
            required
            placeholder="값 (영문, 예: cleaning)"
            className="w-44"
          />
          <Input
            name="label"
            required
            placeholder="표시 이름 (예: 청소)"
            className="w-44"
          />
          <SubmitButton label="추가" />
        </form>
      </div>
    </div>
  );
}
