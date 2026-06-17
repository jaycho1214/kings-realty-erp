"use client";

import {
  useState,
  useTransition,
  useEffect,
  useMemo,
  useCallback,
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
import { createBulkPayment, addPaymentUtilityType } from "../_actions";

interface Lease {
  id: number;
  tenant_name: string;
  property_address: string;
  monthly_rent_krw: number;
}

interface ExchangeRate {
  id: number;
  denomination: number;
  usd_to_krw: number;
}

interface UtilityType {
  id: number;
  name: string;
}

interface LineItem {
  id: string;
  type: "rent" | "utility" | "other";
  label: string;
  amount: number;
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
  utilityTypes,
  defaultLeaseId,
}: {
  leases: Lease[];
  exchangeRates: ExchangeRate[];
  utilityTypes: UtilityType[];
  defaultLeaseId?: number;
}) {
  const [comboOpen, setComboOpen] = useState(false);
  const [selectedLeaseId, setSelectedLeaseId] = useState<number | "">(
    defaultLeaseId ?? "",
  );
  const [billingMonth, setBillingMonth] = useState(currentMonthString());
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(todayString());
  const [notes, setNotes] = useState("");
  const [usdAmount, setUsdAmount] = useState(0);
  const [usdRate, setUsdRate] = useState<number>(
    () => exchangeRates.find((r) => r.denomination === 100)?.usd_to_krw ?? 0,
  );
  const [krwAmount, setKrwAmount] = useState(0);
  const [tenderTouched, setTenderTouched] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showAddType, setShowAddType] = useState<string | false>(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [localUtilityTypes, setLocalUtilityTypes] = useState(utilityTypes);
  const [isAddingType, startAddTypeTransition] = useTransition();

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

  // Tender = how the tenant actually paid: USD portion (converted at usdRate)
  // plus KRW portion. Until staff engages the tender, KRW received defaults to
  // the full charged total (derived, not stored — so a pure-KRW payment needs no
  // edits); once they engage it they control the split.
  const krwReceived = tenderTouched ? krwAmount : totalCharged;
  const usdInKrw = Math.round((usdAmount || 0) * (usdRate || 0));
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

  const addLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      { id: generateId(), type: "utility", label: "", amount: 0 },
    ]);
  }, []);

  const hasRentLine = useMemo(
    () => lineItems.some((item) => item.type === "rent"),
    [lineItems],
  );

  const addRentLine = useCallback(() => {
    if (!selectedLease) return;
    setLineItems((prev) => [
      ...prev,
      {
        id: generateId(),
        type: "rent",
        label: "월세",
        amount: selectedLease.monthly_rent_krw,
      },
    ]);
  }, [selectedLease]);

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
    setUsdAmount(0);
    setUsdRate(primaryRate ?? 0);
    setTenderTouched(false);
    setError(null);
  }, [handleLeaseSelect, primaryRate]);

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
    if (usdAmount > 0 && (!usdRate || usdRate <= 0)) {
      setError("USD 입력 시 환율을 입력해주세요.");
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
      fd.set(`items[${i}].label`, item.label);
      fd.set(`items[${i}].amount_krw`, String(item.amount));
    });

    fd.set("usd_amount", String(usdAmount || 0));
    fd.set("usd_rate", String(usdRate || 0));
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

  // Utility type options for line item select
  const lineTypeOptions = [
    ...localUtilityTypes.map((ut) => ({ value: ut.id, label: ut.name })),
    { value: "other", label: "기타" },
  ];

  const handleAddType = (lineItemId?: string) => {
    if (!newTypeName.trim()) return;
    startAddTypeTransition(async () => {
      const result = await addPaymentUtilityType(newTypeName.trim());
      if (result) {
        setLocalUtilityTypes((prev) => [...prev, result]);
        if (lineItemId) {
          updateLineItem(lineItemId, "label", result.name);
          updateLineItem(lineItemId, "type", "utility");
        }
      }
      setNewTypeName("");
      setShowAddType(false);
    });
  };

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
                        <CommandInput placeholder="이름 또는 주소 검색..." />
                        <CommandList>
                          <CommandEmpty>검색 결과 없음</CommandEmpty>
                          <CommandGroup>
                            {leases.map((lease) => (
                              <CommandItem
                                key={lease.id}
                                value={`${lease.tenant_name} ${lease.property_address}`}
                                onSelect={() => {
                                  handleLeaseSelect(
                                    lease.id === selectedLeaseId
                                      ? ""
                                      : lease.id,
                                  );
                                  setComboOpen(false);
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
                    <TableHead className="w-32">유형</TableHead>
                    <TableHead>내용</TableHead>
                    <TableHead className="w-40 text-right">
                      금액 (&#8361;)
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.type === "rent" ? (
                          "월세"
                        ) : showAddType === item.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={newTypeName}
                              onChange={(e) => setNewTypeName(e.target.value)}
                              placeholder="유형 이름"
                              className="h-7 w-full text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddType(item.id);
                                }
                                if (e.key === "Escape") {
                                  setShowAddType(false);
                                  setNewTypeName("");
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 shrink-0 px-2 text-xs"
                              disabled={isAddingType || !newTypeName.trim()}
                              onClick={() => handleAddType(item.id)}
                            >
                              {isAddingType ? "..." : "추가"}
                            </Button>
                          </div>
                        ) : (
                          <select
                            value={item.label}
                            onChange={(e) => {
                              const selected = e.target.value;
                              if (selected === "__new__") {
                                setShowAddType(item.id);
                                setNewTypeName("");
                                return;
                              }
                              const isUtility = localUtilityTypes.some(
                                (ut) => ut.name === selected,
                              );
                              updateLineItem(item.id, "label", selected);
                              updateLineItem(
                                item.id,
                                "type",
                                isUtility ? "utility" : "other",
                              );
                            }}
                            className="h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-sm dark:bg-input/30"
                          >
                            <option value="">선택...</option>
                            {lineTypeOptions.map((opt) => (
                              <option key={opt.value} value={opt.label}>
                                {opt.label}
                              </option>
                            ))}
                            <option value="__new__">+ 새 유형 추가</option>
                          </select>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.type === "rent" ? "월 임대료" : item.label || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
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
                          className="w-full text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.id)}
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap gap-2">
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
                  type="button"
                  onClick={addLineItem}
                  disabled={!selectedLease}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-input bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                >
                  <Plus className="size-3.5" />
                  항목 추가
                </button>
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

                {/* USD received */}
                <div className="space-y-1.5">
                  <Label>USD 받음</Label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min={0}
                      value={usdAmount || ""}
                      onChange={(e) => {
                        engageTender();
                        setUsdAmount(Number(e.target.value));
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
                      value={usdRate || ""}
                      onChange={(e) => {
                        engageTender();
                        setUsdRate(Number(e.target.value));
                      }}
                      placeholder="환율"
                      className="w-24 text-right"
                    />
                  </div>
                  {usdAmount > 0 && (
                    <p className="text-right text-xs text-muted-foreground">
                      = {formatKRW(usdInKrw)}
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
              className="flex h-10 w-full items-center justify-center rounded-lg bg-primary text-base font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? "등록 중..." : "수납 등록"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
