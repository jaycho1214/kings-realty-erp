"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { PhoneInput } from "@/components/phone-input";
import { BankSelect } from "@/components/bank-select";
import { SexToggle } from "@/components/sex-toggle";
import { createLandlord, updateLandlord } from "../_actions";

interface LandlordFormProps {
  defaultValues?: {
    name?: string;
    phone?: string;
    email?: string | null;
    address?: string | null;
    business_type?: string | null;
    sex?: string | null;
    birth?: string | null;
    bank_name?: string | null;
    bank_account?: string | null;
    account_holder?: string | null;
    notes?: string | null;
  };
  landlordId?: number;
  variant?: "card" | "plain";
  /** Admin/accounting only — controls whether the RRN field is rendered. */
  canViewRrn?: boolean;
  /** True when editing a landlord that already has an RRN on file. */
  hasRrn?: boolean;
}

export function LandlordForm({
  defaultValues,
  landlordId,
  variant = "card",
  canViewRrn = false,
  hasRrn = false,
}: LandlordFormProps) {
  const formAction = landlordId
    ? updateLandlord.bind(null, landlordId)
    : createLandlord;

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
              placeholder="임대인 이름"
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

        <div className="grid gap-5 sm:grid-cols-3">
          <Field className="sm:col-span-2">
            <Label htmlFor="address">주소</Label>
            <Input
              id="address"
              name="address"
              defaultValue={defaultValues?.address ?? ""}
              placeholder="임대인 주소"
            />
          </Field>
          <Field>
            <Label htmlFor="business_type">구분</Label>
            <select
              id="business_type"
              name="business_type"
              defaultValue={defaultValues?.business_type ?? ""}
              className="border-input bg-transparent flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">선택 안 함</option>
              <option value="individual">개인</option>
              <option value="business">사업자</option>
            </select>
          </Field>
        </div>

        {/* Bank details are sensitive (admin/accounting only), same tier as the
            RRN — hide the inputs entirely for non-privileged editors so they are
            neither shown nor submitted (updateLandlord also refuses to overwrite
            them without sensitive access). */}
        {canViewRrn && (
          <div className="grid gap-5 sm:grid-cols-3">
            <Field>
              <Label htmlFor="bank_name">은행명</Label>
              <BankSelect
                id="bank_name"
                name="bank_name"
                defaultValue={defaultValues?.bank_name ?? ""}
              />
            </Field>
            <Field>
              <Label htmlFor="bank_account">계좌번호</Label>
              <Input
                id="bank_account"
                name="bank_account"
                defaultValue={defaultValues?.bank_account ?? ""}
                placeholder="계좌번호"
              />
            </Field>
            <Field>
              <Label htmlFor="account_holder">예금주</Label>
              <Input
                id="account_holder"
                name="account_holder"
                defaultValue={defaultValues?.account_holder ?? ""}
                placeholder="예금주"
              />
            </Field>
          </div>
        )}

        {canViewRrn && (
          <Field>
            <Label htmlFor="rrn">
              주민등록번호
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                (관리자·회계 전용 · 암호화 저장)
              </span>
            </Label>
            <Input
              id="rrn"
              name="rrn"
              inputMode="numeric"
              autoComplete="off"
              defaultValue=""
              placeholder={
                hasRrn
                  ? "등록됨 — 변경하려면 입력 (비워두면 유지)"
                  : "######-#######"
              }
            />
          </Field>
        )}

        <Field>
          <Label htmlFor="notes">비고</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={defaultValues?.notes ?? ""}
            placeholder="메모"
            rows={4}
          />
        </Field>

        <div className="flex justify-end pt-2">
          <SubmitButton label={landlordId ? "저장" : "등록"} />
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
