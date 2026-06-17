"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { createAppliance, updateAppliance } from "../_actions";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

interface ApplianceFormProps {
  applianceId?: number;
  properties: { id: number; address: string }[];
  variant?: "card" | "plain";
  defaultValues?: {
    property_id: number;
    name: string;
    owner: string;
    status: string;
    brand: string | null;
    model_number: string | null;
    as_contact: string | null;
    notes: string | null;
  };
}

export function ApplianceForm({
  applianceId,
  properties,
  defaultValues,
}: ApplianceFormProps) {
  const action = applianceId
    ? updateAppliance.bind(null, applianceId)
    : createAppliance;

  return (
    <form action={action}>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="property_id">
              매물 <span className="text-danger">*</span>
            </Label>
            <select
              id="property_id"
              name="property_id"
              required
              defaultValue={defaultValues?.property_id ?? ""}
              className={selectClass}
            >
              <option value="" disabled>
                매물 선택...
              </option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <Label htmlFor="name">
              비품명 <span className="text-danger">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={defaultValues?.name ?? ""}
              placeholder="예: 정수기, 세탁기, 보일러"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field>
            <Label htmlFor="owner">소유</Label>
            <select
              id="owner"
              name="owner"
              defaultValue={defaultValues?.owner ?? "landlord"}
              className={selectClass}
            >
              <option value="landlord">집주인</option>
              <option value="office">킹스</option>
              <option value="tenant">세입자</option>
            </select>
          </Field>

          <Field>
            <Label htmlFor="status">상태</Label>
            <select
              id="status"
              name="status"
              defaultValue={defaultValues?.status ?? "normal"}
              className={selectClass}
            >
              <option value="normal">정상</option>
              <option value="repair">수리필요</option>
              <option value="broken">사용불가</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <Label htmlFor="brand">브랜드</Label>
            <Input
              id="brand"
              name="brand"
              defaultValue={defaultValues?.brand ?? ""}
              placeholder="예: LG, 린나이"
            />
          </Field>

          <Field>
            <Label htmlFor="model_number">모델번호</Label>
            <Input
              id="model_number"
              name="model_number"
              defaultValue={defaultValues?.model_number ?? ""}
              placeholder="모델명/번호"
            />
          </Field>

          <Field>
            <Label htmlFor="as_contact">A/S 연락처</Label>
            <Input
              id="as_contact"
              name="as_contact"
              defaultValue={defaultValues?.as_contact ?? ""}
              placeholder="A/S 전화/업체"
            />
          </Field>
        </div>

        <Field>
          <Label htmlFor="notes">비고</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={defaultValues?.notes ?? ""}
            placeholder="명의자, 설치 메모 등"
            rows={3}
          />
        </Field>

        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </FieldGroup>
    </form>
  );
}
