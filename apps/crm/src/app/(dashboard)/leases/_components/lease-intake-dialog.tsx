"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { PhoneInput } from "@/components/phone-input";
import { AutocompleteCreate } from "@/components/autocomplete-create";
import { AddressSearch, type AddressData } from "@/components/address-search";
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

// Standard pay grades (Enlisted / Warrant / Officer) — autocomplete suggestions
// for Rank/Grade; free text is still accepted for anything off-list.
const RANK_OPTIONS = [
  ...["E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9"],
  ...["W-1", "W-2", "W-3", "W-4", "W-5"],
  ...["O-1", "O-2", "O-3", "O-4", "O-5", "O-6", "O-7", "O-8", "O-9", "O-10"],
].map((r) => ({ id: r, label: r }));

interface IntakeProps {
  landlords: { id: number; name: string }[];
  properties: {
    id: number;
    address: string;
    address_jibeon: string | null;
    landlord_id: number;
  }[];
  tenants: { id: number; name: string; rank: string | null }[];
  baseLocations: { id: number; name: string; name_ko: string | null }[];
  canViewRrn: boolean;
}

export function LeaseIntakeForm({
  landlords,
  properties,
  tenants,
  baseLocations,
  canViewRrn,
}: IntakeProps) {
  const today = seoulDateString();

  // A non-null picked id means an existing record was chosen → its "new record"
  // fields stay hidden. null means free text → reveal them.
  const [landlordPickedId, setLandlordPickedId] = useState<string | null>(null);
  const [tenantPickedId, setTenantPickedId] = useState<string | null>(null);

  // 매물 is resolved through Postcodify: once an address is selected we either
  // match it (by 지번) to a property we already manage (reuse) or treat it as a
  // new, normalized property.
  const [addressChosen, setAddressChosen] = useState(false);
  const [propertyMatchId, setPropertyMatchId] = useState<string | null>(null);

  const handlePropertyAddress = (data: AddressData | null) => {
    if (!data) {
      setAddressChosen(false);
      setPropertyMatchId(null);
      return;
    }
    setAddressChosen(true);
    const match = properties.find(
      (p) => p.address_jibeon && p.address_jibeon === data.address_jibeon,
    );
    setPropertyMatchId(match ? String(match.id) : null);
  };

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
    id: String(l.id),
    label: l.name,
  }));
  const tenantOptions = tenants.map((t) => ({
    id: String(t.id),
    label: t.name,
    sublabel: t.rank ?? undefined,
  }));

  // New property = an address was chosen but it doesn't match one we already
  // have. Reuse = chosen + matched. Nothing chosen yet = neither shown.
  const newProperty = addressChosen && propertyMatchId === null;
  const newLandlord = landlordPickedId === null;
  const newTenant = tenantPickedId === null;

  return (
    <form
      action={createLeaseIntake}
      onKeyDown={(e) => {
        // Enter inside a text field must never submit the dialog — only the
        // 등록 button does. Autocomplete fields handle Enter themselves
        // (pick the highlighted suggestion); this is the backstop for the rest.
        const target = e.target as HTMLElement;
        if (e.key === "Enter" && target.tagName === "INPUT") {
          e.preventDefault();
        }
      }}
    >
      <FieldGroup>
        {/* ── 매물 ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">매물 (Property)</h3>
          {/* When the chosen address matches a property we already manage, its
              id reuses that record; otherwise empty → the parser creates one. */}
          <input
            type="hidden"
            name="property_id"
            value={propertyMatchId ?? ""}
          />
          <AddressSearch
            namePrefix="property_"
            onSelect={handlePropertyAddress}
          />
          {addressChosen && propertyMatchId && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              이미 등록된 매물입니다 — 기존 매물을 재사용합니다.
            </p>
          )}
          {newProperty && (
            <div className="grid gap-4 sm:grid-cols-2">
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

        {/* ── 임대인 ── (only when the property is new; an existing property
            already carries its landlord) */}
        {newProperty && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">임대인 (Lessor)</h3>
            <Field>
              <Label>
                성명 <span className="text-danger">*</span>
              </Label>
              <AutocompleteCreate
                textName="landlord_name"
                idName="landlord_id"
                options={landlordOptions}
                onPicked={setLandlordPickedId}
                required
                placeholder="임대인 성명 검색 또는 입력"
                newHint="새 임대인 등록"
              />
            </Field>
            {newLandlord && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
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

        {/* ── 임차인 ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">임차인 (Lessee)</h3>
          <Field>
            <Label>
              성명 <span className="text-danger">*</span>
            </Label>
            <AutocompleteCreate
              textName="tenant_name"
              idName="tenant_id"
              options={tenantOptions}
              onPicked={setTenantPickedId}
              required
              placeholder="세입자 성명 검색 또는 입력"
              newHint="새 세입자 등록"
            />
          </Field>
          {newTenant && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="tenant_phone">
                  핸드폰 <span className="text-danger">*</span>
                </Label>
                <PhoneInput name="tenant_phone" required />
              </Field>
              <Field>
                <Label>Rank/Grade</Label>
                <AutocompleteCreate
                  textName="tenant_rank"
                  options={RANK_OPTIONS}
                  placeholder="E-5, O-3 …"
                />
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

        <div className="flex items-center justify-end gap-3 pt-1">
          {!addressChosen && (
            <span className="text-xs text-muted-foreground">
              매물 주소를 검색해 선택해주세요
            </span>
          )}
          <SubmitButton label="등록" disabled={!addressChosen} />
        </div>
      </FieldGroup>
    </form>
  );
}
