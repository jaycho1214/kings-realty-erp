"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { seoulDateString } from "@/lib/date";
import { createPayment, updatePayment } from "../_actions";
import { useChargeTypes } from "@/components/charge-types-provider";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

const paymentMethodOptions = [
  { value: "cash", label: "현금" },
  { value: "card", label: "카드" },
  { value: "transfer", label: "계좌이체" },
];

const statusOptions = [
  { value: "pending", label: "미납" },
  { value: "paid", label: "납부완료" },
  { value: "overdue", label: "연체" },
];

const currencyOptions = [
  { value: "KRW", label: "KRW (₩)" },
  { value: "USD", label: "USD ($)" },
];

interface PaymentFormProps {
  defaultValues?: {
    lease_id?: number;
    payment_type?: string;
    billing_month?: string;
    amount_krw?: string;
    currency_paid?: string;
    amount_paid?: string;
    payment_method?: string;
    payment_date?: string;
    status?: string;
    notes?: string | null;
  };
  paymentId?: number;
  leases: { id: number; tenant_name: string; property_address: string }[];
  variant?: "card" | "plain";
  /**
   * Override the submit handler. When set, it replaces the default create/update
   * action — used by the tenant 납부 내역 dialog so saving stays on the page and
   * closes the dialog instead of redirecting to the payment detail.
   */
  action?: (formData: FormData) => void | Promise<void>;
  submitLabel?: string;
  /** @deprecated 유형 options now come from the shared charge-type catalog
   *  (ChargeTypeProvider); accepted for back-compat but no longer used. */
  billPresets?: { id: number; label: string; type: string }[];
}

export function PaymentForm({
  defaultValues,
  paymentId,
  leases,
  variant = "card",
  action,
  submitLabel,
}: PaymentFormProps) {
  const formAction =
    action ?? (paymentId ? updatePayment.bind(null, paymentId) : createPayment);

  // 유형 options come from the shared DB catalog (ChargeTypeProvider). Keep the
  // row's current type even if it's no longer in the catalog so editing never
  // silently changes it.
  const { map: typeCatalog } = useChargeTypes();
  const finalTypeOptions: { value: string; label: string }[] = [];
  const seenTypes = new Set<string>();
  for (const o of [
    ...Object.entries(typeCatalog).map(([value, v]) => ({
      value,
      label: v.label,
    })),
    ...(defaultValues?.payment_type
      ? [
          {
            value: defaultValues.payment_type,
            label: defaultValues.payment_type,
          },
        ]
      : []),
  ]) {
    if (seenTypes.has(o.value)) continue;
    seenTypes.add(o.value);
    finalTypeOptions.push(o);
  }

  const content = (
    <form action={formAction}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="lease_id">
              계약 <span className="text-danger">*</span>
            </Label>
            <select
              id="lease_id"
              name="lease_id"
              required
              defaultValue={defaultValues?.lease_id ?? ""}
              className={selectClassName}
            >
              <option value="" disabled>
                계약 선택
              </option>
              {leases.map((lease) => (
                <option key={lease.id} value={lease.id}>
                  {lease.tenant_name} - {lease.property_address}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="payment_type">
              유형 <span className="text-danger">*</span>
            </Label>
            <select
              id="payment_type"
              name="payment_type"
              required
              defaultValue={defaultValues?.payment_type ?? "rent"}
              className={selectClassName}
            >
              {finalTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="billing_month">
              청구월 <span className="text-danger">*</span>
            </Label>
            <Input
              id="billing_month"
              name="billing_month"
              type="month"
              required
              defaultValue={defaultValues?.billing_month ?? ""}
            />
          </Field>
          <Field>
            <Label htmlFor="amount_krw">
              금액 (₩) <span className="text-danger">*</span>
            </Label>
            <Input
              id="amount_krw"
              name="amount_krw"
              type="number"
              required
              min={0}
              defaultValue={defaultValues?.amount_krw ?? ""}
              placeholder="0"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="currency_paid">
              납부 통화 <span className="text-danger">*</span>
            </Label>
            <select
              id="currency_paid"
              name="currency_paid"
              required
              defaultValue={defaultValues?.currency_paid ?? "KRW"}
              className={selectClassName}
            >
              {currencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="amount_paid">
              납부 금액 <span className="text-danger">*</span>
            </Label>
            <Input
              id="amount_paid"
              name="amount_paid"
              type="number"
              required
              min={0}
              defaultValue={defaultValues?.amount_paid ?? ""}
              placeholder="0"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="payment_method">
              결제 방법 <span className="text-danger">*</span>
            </Label>
            <select
              id="payment_method"
              name="payment_method"
              required
              defaultValue={defaultValues?.payment_method ?? "transfer"}
              className={selectClassName}
            >
              {paymentMethodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="payment_date">
              납부일 <span className="text-danger">*</span>
            </Label>
            <Input
              id="payment_date"
              name="payment_date"
              type="date"
              required
              defaultValue={defaultValues?.payment_date ?? seoulDateString()}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="status">상태</Label>
            <select
              id="status"
              name="status"
              defaultValue={defaultValues?.status ?? "pending"}
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
          <SubmitButton label={submitLabel ?? (paymentId ? "저장" : "등록")} />
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
