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
import { PhoneInput } from "@/components/phone-input";
import { SexToggle } from "@/components/sex-toggle";
import { DataPanel } from "@/components/data-panel";
import { formatPhone } from "@/lib/utils";
import {
  addLandlordFamilyMember,
  deleteLandlordFamilyMember,
} from "../_actions";

interface FamilyMember {
  id: number;
  name: string;
  relationship: string;
  sex: string | null;
  phone: string | null;
  notes: string | null;
}

interface LandlordFamilyMembersProps {
  landlordId: number;
  members: FamilyMember[];
}

function sexLabel(value: string | null): string {
  if (value === "M") return "남";
  if (value === "F") return "여";
  return "-";
}

function relationshipLabel(value: string): string {
  switch (value) {
    case "spouse":
      return "배우자";
    case "child":
      return "자녀";
    case "parent":
      return "부모";
    case "sibling":
      return "형제자매";
    case "other":
      return "기타";
    default:
      return value;
  }
}

export function LandlordFamilyMembers({
  landlordId,
  members,
}: LandlordFamilyMembersProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await addLandlordFamilyMember(landlordId, formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-3">
      <DataPanel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>관계</TableHead>
              <TableHead>성별</TableHead>
              <TableHead>전화번호</TableHead>
              <TableHead>비고</TableHead>
              <TableHead className="w-[60px]">{""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  등록된 가족 구성원이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => {
                const deleteAction = deleteLandlordFamilyMember.bind(
                  null,
                  member.id,
                  landlordId,
                );
                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {relationshipLabel(member.relationship)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sexLabel(member.sex)}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {member.phone ? formatPhone(member.phone) : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.notes ?? "-"}
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
            name="relationship"
            required
            defaultValue=""
            className="h-8 w-24 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="" disabled>
              관계
            </option>
            <option value="spouse">배우자</option>
            <option value="child">자녀</option>
            <option value="parent">부모</option>
            <option value="sibling">형제자매</option>
            <option value="other">기타</option>
          </select>
          <SexToggle name="sex" compact />
          <PhoneInput name="phone" placeholder="전화번호" className="w-48" />
          <Input name="notes" placeholder="비고" className="w-32" />
          <SubmitButton label="추가" />
        </form>
      </div>
    </div>
  );
}
