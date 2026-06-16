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
import { addPet, deletePet } from "../_actions";

const SPECIES = [
  { value: "dog", label: "개" },
  { value: "cat", label: "고양이" },
  { value: "bird", label: "새" },
  { value: "fish", label: "물고기" },
  { value: "other", label: "기타" },
];

const PET_SIZES = [
  { value: "small", label: "소형" },
  { value: "medium", label: "중형" },
  { value: "large", label: "대형" },
];

interface Pet {
  id: number;
  name: string;
  species: string;
  breed: string | null;
  size: string | null;
  notes: string | null;
}

interface TenantPetsProps {
  tenantId: number;
  pets: Pet[];
}

function speciesLabel(value: string): string {
  return SPECIES.find((s) => s.value === value)?.label ?? value;
}

export function TenantPets({ tenantId, pets }: TenantPetsProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await addPet(tenantId, formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-3">
      <DataPanel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>종류</TableHead>
              <TableHead>품종</TableHead>
              <TableHead>크기</TableHead>
              <TableHead>비고</TableHead>
              <TableHead className="w-[60px]">{""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pets.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  등록된 반려동물이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              pets.map((pet) => {
                const deleteAction = deletePet.bind(null, pet.id, tenantId);
                return (
                  <TableRow key={pet.id}>
                    <TableCell className="font-medium">{pet.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {speciesLabel(pet.species)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {pet.breed ?? "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {pet.size
                        ? (PET_SIZES.find((s) => s.value === pet.size)?.label ??
                          pet.size)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {pet.notes ?? "-"}
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
          <Input name="name" required placeholder="이름" className="w-24" />
          <select
            name="species"
            required
            defaultValue=""
            className="h-8 w-24 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="" disabled>
              종류
            </option>
            {SPECIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Input name="breed" placeholder="품종" className="w-28" />
          <select
            name="size"
            defaultValue=""
            className="h-8 w-20 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">크기</option>
            {PET_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Input name="notes" placeholder="비고" className="w-28" />
          <SubmitButton label="추가" />
        </form>
      </div>
    </div>
  );
}
