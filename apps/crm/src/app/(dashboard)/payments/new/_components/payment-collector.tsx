"use client";

import {
  useState,
  useTransition,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Command,
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Trash2, Plus, Check, ChevronsUpDown } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { seoulDateString, seoulYMD } from "@/lib/date";
import { createBulkPayment, addBillPreset } from "../_actions";
import { TypeCombobox } from "./type-combobox";

interface Lease {
  id: number;
  tenant_name: string;
  property_address: string;
  /** 도로명 address shown as a muted second line under the 지번 address. */
  property_address_sub?: string | null;
  monthly_rent_krw: number;
}

interface ExchangeRate {
  id: number;
  denomination: number;
  usd_to_krw: number;
}

interface PresetOption {
  id: number;
  label: string;
  type: string;
}

interface LineItem {
  id: string;
  type: string;
  label: string;
  // Free-text 내용 for a 기타 line (the combobox keeps showing "기타"); becomes
  // the payment's label on submit.
  memo?: string;
  amount: number;
  chargeId?: number;
}

interface ChargeOption {
  id: number;
  type: string;
  label: string;
  amount: number;
  currency: string;
  billing_month: string;
  status: string;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

// Default payment date/month are the Asia/Seoul business day, not the viewer's
// local day — otherwise a CONUS browser (or any client between 00:00–09:00 KST)
// pre-fills the previous calendar day/month.
function todayString() {
  return seoulDateString();
}

function currentMonthString() {
  const { year, month } = seoulYMD();
  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function PaymentCollector({
  leases,
  exchangeRates,
  billPresets,
  openChargesByLease,
  defaultLeaseId,
}: {
  leases: Lease[];
  exchangeRates: ExchangeRate[];
  billPresets: PresetOption[];
  openChargesByLease?: Record<number, ChargeOption[]>;
  defaultLeaseId?: number;
}) {
  // Land ready to type: a fresh page (no preselected lease) opens the tenant
  // search immediately so staff start typing the name — no mouse, no Tab.
  const [comboOpen, setComboOpen] = useState(!defaultLeaseId);
  const [selectedLeaseId, setSelectedLeaseId] = useState<number | "">(
    defaultLeaseId ?? "",
  );
  const [billingMonth, setBillingMonth] = useState(currentMonthString());
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(todayString());
  const [notes, setNotes] = useState("");
  // Tender is split by bill denomination: $100 bills convert at the $100 rate;
  // everything else ($20 and under) follows the $20 rate.
  const rate100Default =
    exchangeRates.find((r) => r.denomination === 100)?.usd_to_krw ?? 0;
  const rate20Default =
    exchangeRates.find((r) => r.denomination === 20)?.usd_to_krw ??
    rate100Default;
  const [usd100, setUsd100] = useState(0);
  const [usd20, setUsd20] = useState(0);
  const [rate100, setRate100] = useState<number>(rate100Default);
  const [rate20, setRate20] = useState<number>(rate20Default);
  const [krwAmount, setKrwAmount] = useState(0);
  const [tenderTouched, setTenderTouched] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [localPresets, setLocalPresets] = useState(billPresets);
  // The blank line item most recently added auto-opens its type picker.
  const [autoOpenTypeId, setAutoOpenTypeId] = useState<string | null>(null);

  // Keyboard focus-chaining: each action lands focus on the next field staff
  // would touch, so the whole form is reachable without the mouse.
  const addItemBtnRef = useRef<HTMLButtonElement>(null);
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const memoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Holds the latest handleSubmit so the document-level ⌘/Ctrl+Enter listener
  // (bound once) always calls the current closure.
  const submitRef = useRef<() => void>(() => {});

  const selectedLease = useMemo(
    () => leases.find((l) => l.id === selectedLeaseId) ?? null,
    [leases, selectedLeaseId],
  );

  // Use $100 bill rate as the primary rate for conversion
  const primaryRate = useMemo(() => {
    const r = exchangeRates.find((r) => r.denomination === 100);
    return r?.usd_to_krw ?? null;
  }, [exchangeRates]);

  // When lease selection changes, clear line items (rent is no longer
  // auto-added — staff add it on demand via "월세 추가").
  const handleLeaseSelect = useCallback((leaseId: number | "") => {
    setSelectedLeaseId(leaseId);
    setLineItems([]);
  }, []);

  // Auto-dismiss success message
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const totalCharged = useMemo(
    () => lineItems.reduce((sum, item) => sum + (item.amount || 0), 0),
    [lineItems],
  );

  const totalAsUsd = primaryRate ? totalCharged / primaryRate : null;

  // Tender = how the tenant actually paid: $100-bill USD (at rate100) + $20-and-
  // under USD (at rate20) + KRW. Until staff engages the tender, KRW received
  // defaults to the full charged total (derived, not stored — so a pure-KRW
  // payment needs no edits); once they engage it they control the split.
  const krwReceived = tenderTouched ? krwAmount : totalCharged;
  const usd100InKrw = Math.round((usd100 || 0) * (rate100 || 0));
  const usd20InKrw = Math.round((usd20 || 0) * (rate20 || 0));
  const usdInKrw = usd100InKrw + usd20InKrw;
  const usdTotal = (usd100 || 0) + (usd20 || 0);
  const tendered = usdInKrw + (krwReceived || 0);
  const tenderDiff = tendered - totalCharged;

  // On first interaction, seed KRW with the current charged total so entering a
  // USD amount doesn't blank the KRW field. setState in an event handler (not an
  // effect) avoids cascading renders.
  const engageTender = () => {
    if (!tenderTouched) {
      setKrwAmount(totalCharged);
      setTenderTouched(true);
    }
  };

  // Focus (and select) a row's amount field on the next frame — by then the
  // newly added row is committed and its ref is populated.
  const focusAmount = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const el = amountRefs.current[id];
      if (el) {
        el.focus();
        el.select();
      }
    });
  }, []);

  // Same idea for a 기타 row's 내용 field — focused right after 기타 is picked.
  const focusMemo = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const el = memoRefs.current[id];
      if (el) {
        el.focus();
        el.select();
      }
    });
  }, []);

  // Create a new bill/payment type, keep the local catalog in sync so every
  // row sees it, and return it so the picker can select it immediately.
  const addPreset = useCallback(
    async (name: string): Promise<PresetOption | null> => {
      const result = await addBillPreset(name.trim());
      if (!result) return null;
      const preset = { id: result.id, label: result.label, type: result.type };
      setLocalPresets((prev) =>
        prev.some((p) => p.id === preset.id) ? prev : [...prev, preset],
      );
      return preset;
    },
    [],
  );

  const addLineItem = useCallback(() => {
    const id = generateId();
    setLineItems((prev) => [
      ...prev,
      { id, type: "utility", label: "", amount: 0 },
    ]);
    // Blank row: type is unknown, so open its searchable picker first.
    setAutoOpenTypeId(id);
  }, []);

  const hasRentLine = useMemo(
    () => lineItems.some((item) => item.type === "rent"),
    [lineItems],
  );

  const addRentLine = useCallback(() => {
    if (!selectedLease) return;
    const id = generateId();
    setLineItems((prev) => [
      ...prev,
      {
        id,
        type: "rent",
        label: "월세",
        amount: selectedLease.monthly_rent_krw,
      },
    ]);
    // Amount is pre-filled with the rent — land on it (selected) to verify or
    // overtype, then ⌘/Ctrl+Enter submits.
    focusAmount(id);
  }, [selectedLease, focusAmount]);

  // Open (unpaid) charges for the selected lease, minus ones already added as
  // line items — offered as one-click "불러오기" buttons that settle on save.
  const availableCharges = useMemo(() => {
    if (!selectedLeaseId || !openChargesByLease) return [] as ChargeOption[];
    const added = new Set(
      lineItems.map((i) => i.chargeId).filter((v): v is number => v != null),
    );
    return (openChargesByLease[selectedLeaseId as number] ?? []).filter(
      (c) => !added.has(c.id),
    );
  }, [openChargesByLease, selectedLeaseId, lineItems]);

  const addChargeLine = useCallback(
    (c: ChargeOption) => {
      const id = generateId();
      setLineItems((prev) => [
        ...prev,
        {
          id,
          type: c.type,
          label: c.label,
          amount: c.amount,
          chargeId: c.id,
        },
      ]);
      focusAmount(id);
    },
    [focusAmount],
  );

  // Pick a type for a blank row, then land focus on the next field: 기타 needs
  // a 내용 description first, everything else goes straight to the amount.
  const handleTypeSelect = useCallback(
    (id: string, label: string, type: string) => {
      setLineItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, label, type } : item)),
      );
      setAutoOpenTypeId(null);
      if (label === "기타") focusMemo(id);
      else focusAmount(id);
    },
    [focusAmount, focusMemo],
  );

  const removeLineItem = useCallback((id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateLineItem = useCallback(
    (id: string, field: keyof LineItem, value: string | number) => {
      setLineItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, [field]: value } : item,
        ),
      );
    },
    [],
  );

  const resetForm = useCallback(() => {
    handleLeaseSelect("");
    setBillingMonth(currentMonthString());
    setPaymentMethod("cash");
    setPaymentDate(todayString());
    setNotes("");
    setUsd100(0);
    setUsd20(0);
    setRate100(rate100Default);
    setRate20(rate20Default);
    setTenderTouched(false);
    setError(null);
  }, [handleLeaseSelect, rate100Default, rate20Default]);

  const handleSubmit = () => {
    if (!selectedLeaseId) {
      setError("세입자를 선택해주세요.");
      return;
    }
    if (lineItems.length === 0) {
      setError("청구 항목이 없습니다.");
      return;
    }
    if (totalCharged <= 0) {
      setError("청구 금액이 없습니다.");
      return;
    }
    if (usd100 > 0 && (!rate100 || rate100 <= 0)) {
      setError("$100권 환율을 입력해주세요.");
      return;
    }
    if (usd20 > 0 && (!rate20 || rate20 <= 0)) {
      setError("그 외 USD 환율을 입력해주세요.");
      return;
    }

    const fd = new FormData();
    fd.set("lease_id", String(selectedLeaseId));
    fd.set("billing_month", billingMonth);
    fd.set("payment_method", paymentMethod);
    fd.set("payment_date", paymentDate);
    fd.set("notes", notes);
    fd.set("item_count", String(lineItems.length));

    lineItems.forEach((item, i) => {
      fd.set(`items[${i}].type`, item.type);
      // For a 기타 line the description lives in 내용 (memo); fall back to "기타".
      const sentLabel =
        item.label === "기타" ? item.memo?.trim() || "기타" : item.label;
      fd.set(`items[${i}].label`, sentLabel);
      fd.set(`items[${i}].amount_krw`, String(item.amount));
      if (item.chargeId) fd.set(`items[${i}].charge_id`, String(item.chargeId));
    });

    fd.set("usd100_amount", String(usd100 || 0));
    fd.set("usd100_rate", String(rate100 || 0));
    fd.set("usd20_amount", String(usd20 || 0));
    fd.set("usd20_rate", String(rate20 || 0));
    fd.set("usd_in_krw", String(usdInKrw));
    fd.set("krw_amount", String(krwReceived || 0));

    startTransition(async () => {
      const result = await createBulkPayment(fd);
      if (result.success) {
        setSuccess(true);
        resetForm();
      } else {
        setError(result.error ?? "오류가 발생했습니다.");
      }
    });
  };

  // Keep the document-level submit chord pointed at the current closure.
  useEffect(() => {
    submitRef.current = handleSubmit;
  });

  // ⌘/Ctrl+Enter submits from any field (works on macOS and Windows). Bound
  // once; the page stays a <div> with type="button" controls so a stray Enter
  // while editing amounts never fires an accidental submit.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Arriving from a lease link (lease preselected): the tenant search stays
  // closed, so land focus on the default add-action (항목 추가) instead.
  useEffect(() => {
    if (defaultLeaseId) addItemBtnRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 pb-8">
      {/* Success Banner */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-success-weak px-4 py-3 text-sm font-medium text-success">
          <Check className="size-4" />
          수납이 등록되었습니다.
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-weak px-4 py-3 text-sm font-medium text-danger">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-danger/70 hover:text-danger"
          >
            &times;
          </button>
        </div>
      )}

      <div className="flex flex-col gap-5 md:flex-row">
        {/* Left column: Tenant + Line Items */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Section 1: Tenant Selection */}
          <Card>
            <CardHeader>
              <CardTitle>세입자 선택</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-2">
                  <Label>세입자 / 계약</Label>
                  <Popover open={comboOpen} onOpenChange={setComboOpen}>
                    <PopoverTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-8 w-full justify-between px-2.5 font-normal",
                            !selectedLeaseId && "text-muted-foreground",
                          )}
                        />
                      }
                    >
                      <span className="truncate">
                        {selectedLease
                          ? `${selectedLease.tenant_name} \u2014 ${selectedLease.property_address}`
                          : "세입자를 선택하세요..."}
                      </span>
                      <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput
                          placeholder="이름 또는 주소 검색..."
                          autoFocus
                        />
                        <CommandList>
                          <CommandEmpty>검색 결과 없음</CommandEmpty>
                          <CommandGroup>
                            {leases.map((lease) => (
                              <CommandItem
                                key={lease.id}
                                value={`${lease.tenant_name} ${lease.property_address} ${lease.property_address_sub ?? ""}`}
                                onSelect={() => {
                                  const next =
                                    lease.id === selectedLeaseId
                                      ? ""
                                      : lease.id;
                                  handleLeaseSelect(next);
                                  setComboOpen(false);
                                  // Land on 항목 추가 so Enter adds an item by
                                  // default (rent stays one button over).
                                  if (next !== "")
                                    requestAnimationFrame(() =>
                                      addItemBtnRef.current?.focus(),
                                    );
                                }}
                                data-checked={lease.id === selectedLeaseId}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {lease.tenant_name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {lease.property_address}
                                  </span>
                                  {lease.property_address_sub && (
                                    <span className="text-xs text-muted-foreground">
                                      {lease.property_address_sub}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>청구월</Label>
                  <Input
                    type="month"
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(e.target.value)}
                    className="w-full sm:w-44"
                  />
                </div>
              </div>

              {selectedLease && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedLease.tenant_name}</Badge>
                  <Badge variant="outline">
                    {selectedLease.property_address}
                  </Badge>
                  <Badge variant="outline">
                    월세 {formatKRW(selectedLease.monthly_rent_krw)}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>청구 내역</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-32">유형</TableHead>
                    <TableHead>내용</TableHead>
                    <TableHead className="w-40 text-right">
                      금액 (&#8361;)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={item.id}>
                      {/* Delete sits on the left and is skipped by Tab so it
                          never interrupts the type → amount → next-row flow. */}
                      <TableCell>
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label="항목 삭제"
                          onClick={() => removeLineItem(item.id)}
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </TableCell>
                      <TableCell>
                        {item.chargeId || item.type === "rent" ? (
                          item.label || "월세"
                        ) : (
                          <TypeCombobox
                            value={item.label}
                            presets={localPresets}
                            autoOpen={autoOpenTypeId === item.id}
                            onSelect={(label, type) =>
                              handleTypeSelect(item.id, label, type)
                            }
                            onAddPreset={addPreset}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {item.type === "rent" ? (
                          "월 임대료"
                        ) : item.label === "기타" ? (
                          <Input
                            ref={(el) => {
                              memoRefs.current[item.id] = el;
                            }}
                            value={item.memo ?? ""}
                            onChange={(e) =>
                              updateLineItem(item.id, "memo", e.target.value)
                            }
                            onKeyDown={(e) => {
                              // Enter from 내용 hops to the amount, keeping the
                              // keep-adding flow moving.
                              if (
                                e.key === "Enter" &&
                                !e.metaKey &&
                                !e.ctrlKey
                              ) {
                                e.preventDefault();
                                focusAmount(item.id);
                              }
                            }}
                            placeholder="내용 입력"
                            className="h-7 text-sm"
                          />
                        ) : (
                          item.label || "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          ref={(el) => {
                            amountRefs.current[item.id] = el;
                          }}
                          type="number"
                          min={0}
                          value={item.amount || ""}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              "amount",
                              Number(e.target.value),
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.metaKey || e.ctrlKey) return; // ⌘/Ctrl+Enter submits
                            const isLast = index === lineItems.length - 1;
                            if (e.key === "Enter") {
                              e.preventDefault();
                              // Last row: open a fresh row (keep-adding loop).
                              // Otherwise drop into the next existing row.
                              if (isLast) addLineItem();
                              else focusAmount(lineItems[index + 1].id);
                            } else if (
                              e.key === "Tab" &&
                              !e.shiftKey &&
                              isLast
                            ) {
                              // Only the last row's Tab adds a new row; earlier
                              // rows Tab naturally to the next row.
                              e.preventDefault();
                              addLineItem();
                            }
                          }}
                          className="w-full text-right"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {availableCharges.length > 0 && (
                <div className="space-y-2 rounded-lg border border-dashed border-input p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    미납·청구 항목 불러오기
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableCharges.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => addChargeLine(c)}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                      >
                        <Plus className="size-3.5" />
                        <span>
                          {c.billing_month} {c.label}
                        </span>
                        <span className="tabular text-muted-foreground">
                          {formatKRW(c.amount)}
                        </span>
                        {c.status === "overdue" && (
                          <span className="text-[11px] text-danger">미납</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={addRentLine}
                  disabled={!selectedLease || hasRentLine}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-input bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                >
                  <Plus className="size-3.5" />
                  월세 추가
                </button>
                <button
                  ref={addItemBtnRef}
                  type="button"
                  onClick={addLineItem}
                  disabled={!selectedLease}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-input bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                >
                  <Plus className="size-3.5" />
                  항목 추가
                  <kbd className="ml-1 inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
                    ⏎
                  </kbd>
                </button>
                {lineItems.length > 0 && (
                  <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                    금액에서
                    <kbd className="inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                      ⏎ Enter
                    </kbd>
                    <kbd className="inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                      ⇥ Tab
                    </kbd>
                    다음 항목 추가
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-medium">총 청구금액</span>
                <div className="text-right">
                  <span className="tabular text-xl font-semibold">
                    {formatKRW(totalCharged)}
                  </span>
                  {totalAsUsd != null && primaryRate && (
                    <p className="text-xs text-muted-foreground">
                      ≈ ${formatNumber(Math.round(totalAsUsd * 100) / 100)} (@₩
                      {formatNumber(primaryRate)})
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Payment + Metadata + Submit (sticky on desktop) */}
        <div className="md:w-[340px] md:shrink-0">
          <div className="space-y-4 md:sticky md:top-4">
            {/* Section 3: Payment Tender (USD / KRW / hybrid) */}
            <Card>
              <CardHeader>
                <CardTitle>납부 금액</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">총 청구금액</span>
                  <span className="tabular font-semibold">
                    {formatKRW(totalCharged)}
                  </span>
                </div>

                {/* USD received — $100 bills (at $100 rate) and $20-and-under
                    (at $20 rate). */}
                <div className="space-y-1.5">
                  <Label>$100권 받음</Label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min={0}
                      value={usd100 || ""}
                      onChange={(e) => {
                        engageTender();
                        setUsd100(Number(e.target.value));
                      }}
                      placeholder="0"
                      className="text-right"
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      @₩
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={rate100 || ""}
                      onChange={(e) => {
                        engageTender();
                        setRate100(Number(e.target.value));
                      }}
                      placeholder="환율"
                      className="w-24 text-right"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    그 외 USD 받음{" "}
                    <span className="font-normal text-muted-foreground">
                      $50·$20 등 ($100 외 · $20 환율)
                    </span>
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min={0}
                      value={usd20 || ""}
                      onChange={(e) => {
                        engageTender();
                        setUsd20(Number(e.target.value));
                      }}
                      placeholder="0"
                      className="text-right"
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      @₩
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={rate20 || ""}
                      onChange={(e) => {
                        engageTender();
                        setRate20(Number(e.target.value));
                      }}
                      placeholder="환율"
                      className="w-24 text-right"
                    />
                  </div>
                  {usdTotal > 0 && (
                    <p className="text-right text-xs text-muted-foreground">
                      USD 합계 ${usdTotal.toLocaleString()} ={" "}
                      {formatKRW(usdInKrw)}
                    </p>
                  )}
                </div>

                {/* KRW received */}
                <div className="space-y-1.5">
                  <Label>KRW 받음</Label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">₩</span>
                    <Input
                      type="number"
                      min={0}
                      value={krwReceived || ""}
                      onChange={(e) => {
                        setTenderTouched(true);
                        setKrwAmount(Number(e.target.value));
                      }}
                      placeholder="0"
                      className="text-right"
                    />
                  </div>
                </div>

                {/* Reconciliation */}
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm font-medium">받은 금액</span>
                  <div className="text-right">
                    <span className="tabular text-lg font-semibold">
                      {formatKRW(tendered)}
                    </span>
                    {tenderDiff === 0 ? (
                      <p className="text-xs text-success">✓ 청구금액과 일치</p>
                    ) : tenderDiff > 0 ? (
                      <p className="text-xs text-warning">
                        ⚠ {formatKRW(tenderDiff)} 초과
                      </p>
                    ) : (
                      <p className="text-xs text-warning">
                        ⚠ {formatKRW(-tenderDiff)} 부족
                      </p>
                    )}
                  </div>
                </div>

                {!primaryRate && (
                  <p className="text-xs text-warning">
                    오늘 환율 미등록 — USD 입력 시 환율을 직접 입력하세요.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Section 4: Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>기타 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-1">
                  <div className="space-y-2">
                    <Label>결제 방법</Label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    >
                      <option value="cash">현금</option>
                      <option value="card">카드</option>
                      <option value="transfer">계좌이체</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>납부일</Label>
                    <Input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>비고</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="메모 입력 (선택)"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Section 5: Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !selectedLeaseId}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? "등록 중..." : "수납 등록"}
              {!isPending && (
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-primary-foreground/30 px-1.5 font-mono text-[10px] font-medium text-primary-foreground/80">
                  ⌘/Ctrl ↵
                </kbd>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
