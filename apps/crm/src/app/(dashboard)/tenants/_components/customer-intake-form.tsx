"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { PhoneInput } from "@/components/phone-input";
import { AutocompleteCreate } from "@/components/autocomplete-create";
import { AddressField } from "@/components/address-field";
import { addMonths, monthsBetween, seoulDateString } from "@/lib/date";
import { createCustomerIntake } from "../_actions";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

// Standard pay grades — suggestions only; free text accepted.
const RANK_OPTIONS = [
  ...["E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9"],
  ...["W-1", "W-2", "W-3", "W-4", "W-5"],
  ...["O-1", "O-2", "O-3", "O-4", "O-5", "O-6", "O-7", "O-8", "O-9", "O-10"],
].map((r) => ({ id: r, label: r }));

interface Props {
  landlords: { id: number; name: string }[];
  baseLocations: { id: number; name: string; name_ko: string | null }[];
}

/** 옛 ERP 고객등록의 사고방식: 한 장, 아는 것만 채우면 저장. 이름+전화만
 *  필수. 주소를 채우면 집주인→매물→계약까지 한 번에 만들어진다. */
export function CustomerIntakeForm({ landlords, baseLocations }: Props) {
  const today = seoulDateString();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addMonths(today, 12));

  const landlordOptions = landlords.map((l) => ({
    id: String(l.id),
    label: l.name,
  }));

  return (
    <form
      action={createCustomerIntake}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (e.key === "Enter" && target.tagName === "INPUT") {
          e.preventDefault();
        }
      }}
    >
      <FieldGroup>
        {/* ── 고객 ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">고객</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label htmlFor="name">
                이름 <span className="text-danger">*</span>
              </Label>
              <Input id="name" name="name" required autoFocus />
            </Field>
            <Field>
              <Label htmlFor="phone">
                전화번호 <span className="text-danger">*</span>
              </Label>
              <PhoneInput name="phone" required />
            </Field>
            <Field>
              <Label>계급</Label>
              <AutocompleteCreate
                textName="rank"
                options={RANK_OPTIONS}
                placeholder="E-5, O-3 …"
              />
            </Field>
            <Field>
              <Label htmlFor="unit">부대</Label>
              <Input id="unit" name="unit" />
            </Field>
            <Field>
              <Label htmlFor="base_location_id">기지</Label>
              <select
                id="base_location_id"
                name="base_location_id"
                defaultValue={
                  baseLocations[0] ? String(baseLocations[0].id) : ""
                }
                className={selectClassName}
              >
                {baseLocations.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_ko ?? b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* ── 주거 — 전부 선택 입력 ── */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">주거</h3>
            <p className="text-xs text-muted-foreground">
              모르는 항목은 비워두세요 — 나중에 고객 카드에서 채울 수 있습니다.
            </p>
          </div>
          <AddressField />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label>집주인 이름</Label>
              <AutocompleteCreate
                textName="landlord_name"
                idName="landlord_id"
                options={landlordOptions}
                placeholder="검색 또는 입력 (주소 입력 시 필요)"
                newHint="새 집주인 등록"
              />
            </Field>
            <Field>
              <Label htmlFor="landlord_phone">집주인 연락처</Label>
              <PhoneInput name="landlord_phone" />
            </Field>
            <Field>
              <Label htmlFor="monthly_rent_krw">월세 (₩)</Label>
              <Input
                id="monthly_rent_krw"
                name="monthly_rent_krw"
                type="number"
                min={0}
                placeholder="0"
              />
            </Field>
            <Field>
              <Label htmlFor="deposit_krw">보증금 (₩)</Label>
              <Input
                id="deposit_krw"
                name="deposit_krw"
                type="number"
                min={0}
                placeholder="0"
              />
            </Field>
            <Field>
              <Label htmlFor="start_date">계약 시작</Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next) {
                    // Keep the current term length when the start moves.
                    const term = Math.max(1, monthsBetween(startDate, endDate));
                    setEndDate(addMonths(next, term));
                  }
                  setStartDate(next);
                }}
              />
            </Field>
            <Field>
              <Label htmlFor="end_date">계약 만료</Label>
              <Input
                id="end_date"
                name="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* ── 메모 ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">메모</h3>
          <textarea
            name="memo"
            rows={3}
            placeholder="선불금, 특이사항 등 — 자유롭게"
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
          />
        </section>

        <div className="flex justify-end pt-1">
          <SubmitButton label="등록" />
        </div>
      </FieldGroup>
    </form>
  );
}
