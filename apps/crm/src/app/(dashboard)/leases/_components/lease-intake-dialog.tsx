"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { PhoneInput } from "@/components/phone-input";
import { Combobox } from "@/components/combobox";
import { Plus, Trash2 } from "lucide-react";
import { addMonths, monthsBetween, seoulDateString } from "@/lib/date";
import { createLeaseIntake } from "../_actions";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

const PROPERTY_TYPES = [
  { value: "apartment", label: "아파트" },
  { value: "house", label: "주택" },
  { value: "officetel", label: "오피스텔" },
  { value: "villa", label: "빌라" },
];

const RELATIONSHIPS = [
  { value: "spouse", label: "배우자" },
  { value: "child", label: "자녀" },
  { value: "parent", label: "부모" },
  { value: "sibling", label: "형제자매" },
  { value: "other", label: "기타" },
];

interface IntakeProps {
  landlords: { id: number; name: string }[];
  properties: { id: number; address: string; landlord_id: number }[];
  tenants: { id: number; name: string; rank: string | null }[];
  baseLocations: { id: number; name: string; name_ko: string | null }[];
  canViewRrn: boolean;
}

type Mode = "new" | "existing";

function SectionToggle({
  mode,
  onChange,
  existingLabel,
  newLabel,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  existingLabel: string;
  newLabel: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-input p-0.5 text-sm">
      {(["existing", "new"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-md px-2.5 py-1 ${
            mode === m ? "bg-muted font-medium" : "text-muted-foreground"
          }`}
        >
          {m === "existing" ? existingLabel : newLabel}
        </button>
      ))}
    </div>
  );
}

export function LeaseIntakeForm({
  landlords,
  properties,
  tenants,
  baseLocations,
  canViewRrn,
}: IntakeProps) {
  const today = seoulDateString();

  const [propertyMode, setPropertyMode] = useState<Mode>("new");
  const [landlordMode, setLandlordMode] = useState<Mode>("new");
  const [tenantMode, setTenantMode] = useState<Mode>("new");

  const [coLessors, setCoLessors] = useState<number[]>([]);
  const [coSeq, setCoSeq] = useState(0);

  const [startDate, setStartDate] = useState(today);
  const [termMonths, setTermMonths] = useState<number | "">(12);
  const [endDate, setEndDate] = useState(addMonths(today, 12));

  const recalcEnd = (start: string, term: number | "") => {
    if (start && typeof term === "number" && term > 0) {
      setEndDate(addMonths(start, term));
    }
  };

  const landlordOptions = landlords.map((l) => ({
    value: String(l.id),
    label: l.name,
  }));
  const propertyOptions = properties.map((p) => ({
    value: String(p.id),
    label: p.address,
  }));
  const tenantOptions = tenants.map((t) => ({
    value: String(t.id),
    label: `${t.name}${t.rank ? ` (${t.rank})` : ""}`,
  }));

  return (
    <form action={createLeaseIntake}>
      <input type="hidden" name="property_mode" value={propertyMode} />
      <input type="hidden" name="landlord_mode" value={landlordMode} />
      <input type="hidden" name="tenant_mode" value={tenantMode} />

      <FieldGroup>
        {/* ── 임대인 ── (only when creating a new property) */}
        {propertyMode === "new" && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">임대인 (Lessor)</h3>
              <SectionToggle
                mode={landlordMode}
                onChange={setLandlordMode}
                existingLabel="기존 선택"
                newLabel="신규"
              />
            </div>

            {landlordMode === "existing" ? (
              <Combobox
                name="landlord_id"
                options={landlordOptions}
                placeholder="임대인 선택"
                searchPlaceholder="이름으로 검색..."
                emptyText="임대인을 찾을 수 없습니다"
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label htmlFor="landlord_name">
                      성명 <span className="text-danger">*</span>
                    </Label>
                    <Input id="landlord_name" name="landlord_name" required />
                  </Field>
                  <Field>
                    <Label htmlFor="landlord_phone">
                      핸드폰 <span className="text-danger">*</span>
                    </Label>
                    <PhoneInput name="landlord_phone" required />
                  </Field>
                  <Field>
                    <Label htmlFor="landlord_email">이메일</Label>
                    <Input
                      id="landlord_email"
                      name="landlord_email"
                      type="email"
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="landlord_address">주소</Label>
                    <Input id="landlord_address" name="landlord_address" />
                  </Field>
                  {canViewRrn && (
                    <Field>
                      <Label htmlFor="landlord_rrn">KID# / 주민번호</Label>
                      <Input
                        id="landlord_rrn"
                        name="landlord_rrn"
                        placeholder="######-#######"
                        autoComplete="off"
                      />
                    </Field>
                  )}
                </div>

                {/* 공동 임대인 (가족) */}
                <div className="space-y-2">
                  {coLessors.map((id, i) => (
                    <div
                      key={id}
                      className="grid items-end gap-2 sm:grid-cols-[1fr_7rem_1fr_auto]"
                    >
                      <Input
                        name={`lessor[${i}].name`}
                        placeholder="공동 임대인 성명"
                        required
                      />
                      <select
                        name={`lessor[${i}].relationship`}
                        defaultValue="spouse"
                        className={selectClassName}
                      >
                        {RELATIONSHIPS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <PhoneInput
                        name={`lessor[${i}].phone`}
                        placeholder="핸드폰"
                      />
                      <div className="flex gap-1">
                        {canViewRrn && (
                          <Input
                            name={`lessor[${i}].rrn`}
                            placeholder="주민번호"
                            autoComplete="off"
                            className="w-36"
                          />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            setCoLessors((xs) => xs.filter((x) => x !== id))
                          }
                          aria-label="공동 임대인 삭제"
                          className="text-muted-foreground hover:text-danger"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCoLessors((xs) => [...xs, coSeq]);
                      setCoSeq((n) => n + 1);
                    }}
                  >
                    <Plus className="size-4" /> 공동 임대인 (가족) 추가
                  </Button>
                </div>
              </>
            )}
          </section>
        )}

        {/* ── 매물 ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">매물 (Property)</h3>
            <SectionToggle
              mode={propertyMode}
              onChange={setPropertyMode}
              existingLabel="기존 선택"
              newLabel="신규"
            />
          </div>
          {propertyMode === "existing" ? (
            <Combobox
              name="property_id"
              options={propertyOptions}
              placeholder="매물 선택"
              searchPlaceholder="주소로 검색..."
              emptyText="매물을 찾을 수 없습니다"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <Label htmlFor="property_address">
                  임대물건 주소 <span className="text-danger">*</span>
                </Label>
                <Input id="property_address" name="property_address" required />
              </Field>
              <Field>
                <Label htmlFor="property_size_pyeong">평수</Label>
                <Input
                  id="property_size_pyeong"
                  name="property_size_pyeong"
                  type="number"
                  min={0}
                  step="0.1"
                />
              </Field>
              <Field>
                <Label htmlFor="property_type">종류</Label>
                <select
                  id="property_type"
                  name="property_type"
                  defaultValue="apartment"
                  className={selectClassName}
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </section>

        {/* ── 임차인 ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">임차인 (Lessee)</h3>
            <SectionToggle
              mode={tenantMode}
              onChange={setTenantMode}
              existingLabel="기존 선택"
              newLabel="신규"
            />
          </div>
          {tenantMode === "existing" ? (
            <Combobox
              name="tenant_id"
              options={tenantOptions}
              placeholder="세입자 선택"
              searchPlaceholder="이름으로 검색..."
              emptyText="세입자를 찾을 수 없습니다"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="tenant_name">
                  성명 <span className="text-danger">*</span>
                </Label>
                <Input id="tenant_name" name="tenant_name" required />
              </Field>
              <Field>
                <Label htmlFor="tenant_phone">
                  핸드폰 <span className="text-danger">*</span>
                </Label>
                <PhoneInput name="tenant_phone" required />
              </Field>
              <Field>
                <Label htmlFor="tenant_rank">Rank/Grade</Label>
                <Input id="tenant_rank" name="tenant_rank" />
              </Field>
              <Field>
                <Label htmlFor="tenant_military_id">DODID</Label>
                <Input id="tenant_military_id" name="tenant_military_id" />
              </Field>
              <Field>
                <Label htmlFor="tenant_unit">소속/Unit</Label>
                <Input id="tenant_unit" name="tenant_unit" />
              </Field>
              <Field>
                <Label htmlFor="tenant_email">이메일</Label>
                <Input id="tenant_email" name="tenant_email" type="email" />
              </Field>
              <Field>
                <Label htmlFor="base_location_id">
                  기지 <span className="text-danger">*</span>
                </Label>
                <select
                  id="base_location_id"
                  name="base_location_id"
                  defaultValue={
                    baseLocations[0] ? String(baseLocations[0].id) : ""
                  }
                  className={selectClassName}
                  required
                >
                  {baseLocations.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name_ko ?? b.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </section>

        {/* ── 계약 조건 ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">계약 조건 (Terms)</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <Label htmlFor="start_date">
                시작일 <span className="text-danger">*</span>
              </Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  recalcEnd(e.target.value, termMonths);
                }}
              />
            </Field>
            <Field>
              <Label htmlFor="term_months">계약기간 (개월)</Label>
              <Input
                id="term_months"
                type="number"
                min={1}
                max={120}
                value={termMonths}
                onChange={(e) => {
                  const v = e.target.value === "" ? "" : Number(e.target.value);
                  setTermMonths(v);
                  recalcEnd(startDate, v);
                }}
              />
            </Field>
            <Field>
              <Label htmlFor="end_date">
                종료일 <span className="text-danger">*</span>
              </Label>
              <Input
                id="end_date"
                name="end_date"
                type="date"
                required
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  if (startDate && e.target.value) {
                    setTermMonths(monthsBetween(startDate, e.target.value));
                  }
                }}
              />
            </Field>
            <Field>
              <Label htmlFor="monthly_rent_krw">
                월세 (₩) <span className="text-danger">*</span>
              </Label>
              <Input
                id="monthly_rent_krw"
                name="monthly_rent_krw"
                type="number"
                min={0}
                required
                placeholder="0"
              />
            </Field>
            <Field>
              <Label htmlFor="deposit_krw">
                보증금 (₩) <span className="text-danger">*</span>
              </Label>
              <Input
                id="deposit_krw"
                name="deposit_krw"
                type="number"
                min={0}
                required
                placeholder="0"
              />
            </Field>
          </div>
          <Field>
            <Label htmlFor="notes">특별조항 / 비고</Label>
            <Input id="notes" name="notes" placeholder="특별 조항" />
          </Field>
        </section>

        <div className="flex justify-end pt-1">
          <SubmitButton label="등록" />
        </div>
      </FieldGroup>
    </form>
  );
}
