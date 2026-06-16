import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKRW(amount: number | string): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num)) return "₩0";
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(num);
}

export function formatUSD(amount: number | string): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

/** Format a date (or date-only column value) as a Korean date; "-" when null. */
export function formatDate(value: Date | string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString("ko-KR") : "-";
}

/** Compact Korean date "YYYY.MM.DD" (zero-padded, no trailing dot). */
export function formatDateCompact(value: Date | string): string {
  return new Date(value)
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

/** Billing month as "YYYY.MM". */
export function formatBillingMonth(value: Date | string): string {
  const d = new Date(value);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatPhone(value: string): string {
  if (!value) return "";
  // Strip to digits and optional leading +
  if (value.startsWith("+82")) {
    const d = value.slice(3).replace(/\D/g, "");
    const local = d.startsWith("0") ? d : `0${d}`;
    if (local.length <= 3) return local;
    if (local.length <= 7) return `${local.slice(0, 3)}-${local.slice(3)}`;
    return `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
  }
  if (value.startsWith("+1")) {
    const d = value.slice(2).replace(/\D/g, "");
    if (d.length <= 3) return `+1 ${d}`;
    if (d.length <= 6) return `+1 ${d.slice(0, 3)}-${d.slice(3)}`;
    return `+1 ${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  // Fallback: just add hyphens to Korean-style number
  const d = value.replace(/\D/g, "");
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
