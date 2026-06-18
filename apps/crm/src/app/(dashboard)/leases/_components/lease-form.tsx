"use client";

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { Combobox } from "@/components/combobox";
import { createLease, updateLease } from "../_actions";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

const statusOptions = [
  { value: "draft", label: "작성중" },
  { value: "active", label: "유효" },
  { value: "renewed", label: "갱신" },
  { value: "expired", label: "만료" },
  { value: "terminated", label: "해지" },
];

function toDateString(date: Date) {
  return date.toISOString().split("T")[0];
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  // Move to the 1st before shifting the month so an out-of-range day can't
  // overflow into the next month (e.g. Jan 31 + 1 -> "Feb 31" -> Mar 3).
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  // Clamp the original day to the target month's last day.
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth())
  );
}

interface LeaseFormProps {
  defaultValues?: {
    property_id?: number;
    tenant_id?: number;
    start_date?: string;
    end_date?: string;
    monthly_rent_krw?: string;
    deposit_krw?: string;
    landlord_rent_krw?: string | null;
    landlord_deposit_krw?: string | null;
    realty_fee?: string | null;
    realty_fee_currency?: string | null;
    auto_renew?: boolean;
    status?: string;
    notes?: string | null;
  };
  leaseId?: number;
  properties: {
    id: number;
    address: string;
    /** The property's other address (e.g. 도로명 when 지번 is primary), shown
     *  as a muted second line in the combobox and included in its search. */
    address_sub?: string | null;
    monthly_rent_krw?: string;
    deposit_krw?: string;
  }[];
  tenants: { id: number; name: string; rank?: string | null }[];
  /** Seeded realty-fee defaults by currency (from realty_fee_default). */
  realtyFeeDefaults?: { USD?: string; KRW?: string };
  variant?: "card" | "plain";
}

export function LeaseForm({
  defaultValues,
  leaseId,
  properties,
  tenants,
  realtyFeeDefaults,
  variant = "card",
}: LeaseFormProps) {
  const isEdit = !!leaseId;
  const formAction = leaseId ? updateLease.bind(null, leaseId) : createLease;

  const today = toDateString(new Date());

  const [realtyFeeCurrency, setRealtyFeeCurrency] = useState(
    defaultValues?.realty_fee_currency ?? "KRW",
  );
  const [realtyFee, setRealtyFee] = useState(
    defaultValues?.realty_fee ??
      realtyFeeDefaults?.[
        (defaultValues?.realty_fee_currency ?? "KRW") as "USD" | "KRW"
      ] ??
      "",
  );

  const handleRealtyFeeCurrencyChange = (value: string) => {
    setRealtyFeeCurrency(value);
    // On create, snap the amount to the seeded default for the chosen currency.
    if (!isEdit && (value === "USD" || value === "KRW")) {
      const seeded = realtyFeeDefaults?.[value];
      if (seeded) setRealtyFee(seeded);
    }
  };

  // Compute initial lease term from defaultValues
  const initialTermMonths =
    defaultValues?.start_date && defaultValues?.end_date
      ? monthsBetween(
          new Date(defaultValues.start_date),
          new Date(defaultValues.end_date),
        )
      : 12;

  const [rent, setRent] = useState(defaultValues?.monthly_rent_krw ?? "");
  const [deposit, setDeposit] = useState(defaultValues?.deposit_krw ?? "");
  const [startDate, setStartDate] = useState(
    defaultValues?.start_date ?? today,
  );
  const [endDate, setEndDate] = useState(
    defaultValues?.end_date ?? toDateString(addMonths(new Date(today), 12)),
  );
  const [termMonths, setTermMonths] = useState<number | "">(initialTermMonths);

  // Build lookup for property financial data
  const propertyMap = useMemo(
    () =>
      new Map(
        properties.map((p) => [
          String(p.id),
          { monthly_rent_krw: p.monthly_rent_krw, deposit_krw: p.deposit_krw },
        ]),
      ),
    [properties],
  );

  const handlePropertyChange = useCallback(
    (value: string) => {
      if (isEdit) return;
      const data = propertyMap.get(value);
      if (data) {
        if (data.monthly_rent_krw) setRent(String(data.monthly_rent_krw));
        if (data.deposit_krw) setDeposit(String(data.deposit_krw));
      }
    },
    [isEdit, propertyMap],
  );

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (value && typeof termMonths === "number" && termMonths > 0) {
      setEndDate(toDateString(addMonths(new Date(value), termMonths)));
    }
  };

  const handleTermChange = (value: number | "") => {
    setTermMonths(value);
    if (startDate && typeof value === "number" && value > 0) {
      setEndDate(toDateString(addMonths(new Date(startDate), value)));
    }
  };

  const propertyOptions = properties.map((p) => ({
    value: String(p.id),
    label: p.address,
    sublabel: p.address_sub ?? undefined,
  }));

  const tenantOptions = tenants.map((t) => ({
    value: String(t.id),
    label: `${t.name}${t.rank ? ` (${t.rank})` : ""}`,
  }));

  const content = (
    <form action={formAction}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="property_id">
              매물 <span className="text-danger">*</span>
            </Label>
            <Combobox
              name="property_id"
              required
              options={propertyOptions}
              defaultValue={
                defaultValues?.property_id
                  ? String(defaultValues.property_id)
                  : undefined
              }
              onChange={handlePropertyChange}
              placeholder="매물 선택"
              searchPlaceholder="주소로 검색..."
              emptyText="매물을 찾을 수 없습니다"
            />
          </Field>
          <Field>
            <Label htmlFor="tenant_id">
              세입자 <span className="text-danger">*</span>
            </Label>
            <Combobox
              name="tenant_id"
              required
              options={tenantOptions}
              defaultValue={
                defaultValues?.tenant_id
                  ? String(defaultValues.tenant_id)
                  : undefined
              }
              placeholder="세입자 선택"
              searchPlaceholder="이름으로 검색..."
              emptyText="세입자를 찾을 수 없습니다"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
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
              onChange={(e) => handleStartDateChange(e.target.value)}
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
              onChange={(e) =>
                handleTermChange(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              placeholder="12"
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
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="monthly_rent_krw">
              월세 · 임차인 (₩) <span className="text-danger">*</span>
            </Label>
            <Input
              id="monthly_rent_krw"
              name="monthly_rent_krw"
              type="number"
              required
              min={0}
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field>
            <Label htmlFor="deposit_krw">
              보증금 · 임차인 (₩) <span className="text-danger">*</span>
            </Label>
            <Input
              id="deposit_krw"
              name="deposit_krw"
              type="number"
              required
              min={0}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="landlord_rent_krw">월세 · 임대인 (₩)</Label>
            <Input
              id="landlord_rent_krw"
              name="landlord_rent_krw"
              type="number"
              min={0}
              defaultValue={defaultValues?.landlord_rent_krw ?? ""}
              placeholder="우리가 임대인에게 지급"
            />
          </Field>
          <Field>
            <Label htmlFor="landlord_deposit_krw">보증금 · 임대인 (₩)</Label>
            <Input
              id="landlord_deposit_krw"
              name="landlord_deposit_krw"
              type="number"
              min={0}
              defaultValue={defaultValues?.landlord_deposit_krw ?? ""}
              placeholder="임대인 기준 보증금"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="realty_fee">중개 수수료 (Realty fee)</Label>
            <div className="flex gap-2">
              <select
                name="realty_fee_currency"
                value={realtyFeeCurrency}
                onChange={(e) => handleRealtyFeeCurrencyChange(e.target.value)}
                className={`${selectClassName} w-20 shrink-0`}
              >
                <option value="KRW">₩</option>
                <option value="USD">$</option>
              </select>
              <Input
                id="realty_fee"
                name="realty_fee"
                type="number"
                min={0}
                value={realtyFee}
                onChange={(e) => setRealtyFee(e.target.value)}
                placeholder="중개 수수료"
              />
            </div>
          </Field>
          <Field>
            <Label htmlFor="auto_renew">자동 갱신</Label>
            <label className="flex h-8 items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="auto_renew"
                name="auto_renew"
                value="1"
                defaultChecked={defaultValues?.auto_renew ?? false}
                className="size-4 rounded border-input"
              />
              <span className="text-muted-foreground">
                계약 만료 시 자동 갱신
              </span>
            </label>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="status">상태</Label>
            <select
              id="status"
              name="status"
              defaultValue={defaultValues?.status ?? "active"}
              className={selectClassName}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="notes">비고</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={defaultValues?.notes ?? ""}
              placeholder="메모"
              rows={3}
            />
          </Field>
        </div>

        <div className="flex justify-end pt-2">
          <SubmitButton label={leaseId ? "저장" : "등록"} />
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
