"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { PhoneInput } from "@/components/phone-input";
import { SexToggle } from "@/components/sex-toggle";
import { Trash2, Plus } from "lucide-react";
import { createTenant, updateTenant } from "../_actions";

const BRANCHES = [
  { value: "army", label: "Army" },
  { value: "air_force", label: "Air Force" },
  { value: "navy", label: "Navy" },
  { value: "marines", label: "Marines" },
  { value: "space_force", label: "Space Force" },
  { value: "coast_guard", label: "Coast Guard" },
];

const RANK_GROUPS = [
  {
    label: "Enlisted",
    ranks: ["E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9"],
  },
  { label: "Warrant Officer", ranks: ["W-1", "W-2", "W-3", "W-4", "W-5"] },
  {
    label: "Officer",
    ranks: [
      "O-1",
      "O-2",
      "O-3",
      "O-4",
      "O-5",
      "O-6",
      "O-7",
      "O-8",
      "O-9",
      "O-10",
      "O-11",
    ],
  },
];

const RELATIONSHIPS = [
  { value: "spouse", label: "배우자" },
  { value: "child", label: "자녀" },
  { value: "parent", label: "부모" },
  { value: "sibling", label: "형제자매" },
  { value: "other", label: "기타" },
];

const SPECIES = [
  { value: "dog", label: "개" },
  { value: "cat", label: "고양이" },
  { value: "bird", label: "새" },
  { value: "fish", label: "물고기" },
  { value: "other", label: "기타" },
];

const PET_SIZES = [
  { value: "small", label: "소형 (10kg 이하)" },
  { value: "medium", label: "중형 (10-25kg)" },
  { value: "large", label: "대형 (25kg 이상)" },
];

interface FamilyMemberRow {
  id: number;
}

interface PetRow {
  id: number;
}

interface BaseLocation {
  id: number;
  name: string;
  name_ko: string | null;
}

interface TenantFormProps {
  defaultValues?: {
    name?: string;
    phone?: string;
    email?: string | null;
    sex?: string | null;
    birth?: string | null;
    branch?: string | null;
    rank?: string | null;
    unit?: string | null;
    deros?: string | null;
    base_location_id?: number | null;
    military_id?: string | null;
    dependent_status?: string | null;
    dependent_count?: number | null;
    notes?: string | null;
  };
  tenantId?: number;
  variant?: "card" | "plain";
  baseLocations?: BaseLocation[];
}

export function TenantForm({
  defaultValues,
  tenantId,
  variant = "card",
  baseLocations = [],
}: TenantFormProps) {
  const isCreateMode = !tenantId;
  const formAction = tenantId
    ? updateTenant.bind(null, tenantId)
    : createTenant;

  const [familyMembers, setFamilyMembers] = useState<FamilyMemberRow[]>([]);
  const [pets, setPets] = useState<PetRow[]>([]);
  const [nextFamilyId, setNextFamilyId] = useState(0);
  const [nextPetId, setNextPetId] = useState(0);

  const addFamilyMember = () => {
    setFamilyMembers((prev) => [...prev, { id: nextFamilyId }]);
    setNextFamilyId((prev) => prev + 1);
  };

  const removeFamilyMember = (id: number) => {
    setFamilyMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const addPet = () => {
    setPets((prev) => [...prev, { id: nextPetId }]);
    setNextPetId((prev) => prev + 1);
  };

  const removePet = (id: number) => {
    setPets((prev) => prev.filter((p) => p.id !== id));
  };

  const content = (
    <form action={formAction}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="name">
              이름 <span className="text-danger">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={defaultValues?.name ?? ""}
              placeholder="세입자 이름"
            />
          </Field>
          <Field>
            <Label htmlFor="phone">
              전화번호 <span className="text-danger">*</span>
            </Label>
            <PhoneInput
              id="phone"
              name="phone"
              required
              defaultValue={defaultValues?.phone ?? ""}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
              placeholder="email@example.com"
            />
          </Field>
          <Field>
            <Label>성별</Label>
            <SexToggle name="sex" defaultValue={defaultValues?.sex} />
          </Field>
          <Field>
            <Label htmlFor="birth">생년월일</Label>
            <Input
              id="birth"
              name="birth"
              type="date"
              defaultValue={defaultValues?.birth ?? ""}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <Label htmlFor="branch">군종</Label>
            <select
              id="branch"
              name="branch"
              defaultValue={defaultValues?.branch ?? ""}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">선택</option>
              {BRANCHES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="rank">계급</Label>
            <select
              id="rank"
              name="rank"
              defaultValue={defaultValues?.rank ?? ""}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">선택</option>
              {RANK_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.ranks.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="unit">부대</Label>
            <Input
              id="unit"
              name="unit"
              defaultValue={defaultValues?.unit ?? ""}
              placeholder="예: 2ID, USAG-H"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="base_location_id">기지</Label>
            <select
              id="base_location_id"
              name="base_location_id"
              defaultValue={defaultValues?.base_location_id ?? ""}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">선택</option>
              {baseLocations.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.name_ko ? ` (${b.name_ko})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="deros">DEROS</Label>
            <Input
              id="deros"
              name="deros"
              type="date"
              defaultValue={defaultValues?.deros ?? ""}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <Label htmlFor="military_id">군 ID / Sponsor</Label>
            <Input
              id="military_id"
              name="military_id"
              defaultValue={defaultValues?.military_id ?? ""}
              placeholder="내부 식별용"
            />
          </Field>
          <Field>
            <Label htmlFor="dependent_status">부양가족</Label>
            <select
              id="dependent_status"
              name="dependent_status"
              defaultValue={defaultValues?.dependent_status ?? ""}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">선택</option>
              <option value="with">동반 (with dependents)</option>
              <option value="without">비동반 (without dependents)</option>
            </select>
          </Field>
          <Field>
            <Label htmlFor="dependent_count">부양가족 수</Label>
            <Input
              id="dependent_count"
              name="dependent_count"
              type="number"
              min={0}
              defaultValue={
                defaultValues?.dependent_count != null
                  ? String(defaultValues.dependent_count)
                  : ""
              }
              placeholder="인원 수"
            />
          </Field>
        </div>

        {isCreateMode && (
          <>
            {/* Family Members Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">가족 구성원</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={addFamilyMember}
                >
                  <Plus className="size-3.5" />
                  추가
                </Button>
              </div>
              {familyMembers.map((member, index) => (
                <div
                  key={member.id}
                  className="space-y-2 rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      가족 {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-muted-foreground hover:text-danger"
                      onClick={() => removeFamilyMember(member.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      name={`family[${index}].name`}
                      placeholder="이름"
                      required
                    />
                    <select
                      name={`family[${index}].relationship`}
                      required
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    >
                      <option value="">관계 선택</option>
                      {RELATIONSHIPS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <SexToggle name={`family[${index}].sex`} compact />
                    <PhoneInput name={`family[${index}].phone`} />
                    <Input name={`family[${index}].notes`} placeholder="비고" />
                  </div>
                </div>
              ))}
            </div>

            {/* Pets Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">반려동물</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={addPet}
                >
                  <Plus className="size-3.5" />
                  추가
                </Button>
              </div>
              {pets.map((pet, index) => (
                <div key={pet.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      반려동물 {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-muted-foreground hover:text-danger"
                      onClick={() => removePet(pet.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      name={`pet[${index}].name`}
                      placeholder="이름"
                      required
                    />
                    <select
                      name={`pet[${index}].species`}
                      required
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    >
                      <option value="">종류 선택</option>
                      {SPECIES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <Input name={`pet[${index}].breed`} placeholder="품종" />
                    <select
                      name={`pet[${index}].size`}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    >
                      <option value="">크기 선택</option>
                      {PET_SIZES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <Input name={`pet[${index}].notes`} placeholder="비고" />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <SubmitButton label={tenantId ? "저장" : "등록"} />
        </div>
      </FieldGroup>
    </form>
  );

  if (variant === "plain") return content;

  return (
    <Card>
      <CardContent className="pt-6">{content}</CardContent>
    </Card>
  );
}
