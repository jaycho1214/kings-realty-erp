"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2, Eye, EyeOff } from "lucide-react";
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
  revealLandlordFamilyMemberRrn,
} from "../_actions";

// Inlined (NOT imported from @/lib/rrn — that module pulls in node:crypto and
// must never be bundled into a client component).
const RRN_MASK = "●●●●●●-●●●●●●●";

interface FamilyMember {
  id: number;
  name: string;
  relationship: string;
  sex: string | null;
  phone: string | null;
  notes: string | null;
  hasRrn: boolean;
}

interface LandlordFamilyMembersProps {
  landlordId: number;
  members: FamilyMember[];
  canViewRrn: boolean;
}

function FamilyMemberRrn({
  memberId,
  hasRrn,
}: {
  memberId: number;
  hasRrn: boolean;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!hasRrn) return <span className="text-muted-foreground">-</span>;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{revealed ?? RRN_MASK}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={revealed ? "주민등록번호 가리기" : "주민등록번호 보기"}
        onClick={() => {
          if (revealed) {
            setRevealed(null);
            return;
          }
          setError(null);
          startTransition(async () => {
            const res = await revealLandlordFamilyMemberRrn(memberId);
            if ("rrn" in res) setRevealed(res.rrn);
            else setError(res.error);
          });
        }}
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
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
  canViewRrn,
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
              {canViewRrn && <TableHead>주민번호</TableHead>}
              <TableHead>비고</TableHead>
              <TableHead className="w-[60px]">{""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={canViewRrn ? 7 : 6}
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
                    {canViewRrn && (
                      <TableCell className="tabular text-muted-foreground">
                        <FamilyMemberRrn
                          memberId={member.id}
                          hasRrn={member.hasRrn}
                        />
                      </TableCell>
                    )}
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
          {canViewRrn && (
            <Input
              name="rrn"
              placeholder="주민번호"
              autoComplete="off"
              className="w-36"
            />
          )}
          <Input name="notes" placeholder="비고" className="w-32" />
          <SubmitButton label="추가" />
        </form>
      </div>
    </div>
  );
}
