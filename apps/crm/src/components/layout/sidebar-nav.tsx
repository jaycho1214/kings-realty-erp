"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  CalendarDays,
  Users,
  Building2,
  Contact,
  CreditCard,
  ArrowLeftRight,
  Wrench,
  Settings,
  Bell,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavCounts = {
  tenants: number;
  leases: number;
  properties: number;
  unpaid: number;
  services: number;
  notifications: number;
};

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type Item = {
  title: string;
  href: string;
  icon: LucideIcon;
  count?: number;
  alert?: number;
};

function NavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: Item;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <item.icon className="size-[17px] shrink-0" strokeWidth={1.8} />
      <span className="flex-1 truncate">{item.title}</span>
      {item.alert ? (
        <span className="tabular inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-danger px-1.5 text-[10.5px] font-semibold text-white">
          {item.alert}
        </span>
      ) : item.count != null ? (
        <span className="tabular text-[11.5px] text-muted-foreground/80">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground/80">
      {children}
    </div>
  );
}

export function SidebarNav({
  counts,
  open,
  onClose,
}: {
  counts: NavCounts;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [billingOpen, setBillingOpen] = React.useState(true);

  // Lock body scroll while the mobile drawer is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const overview: Item[] = [
    { title: "대시보드", href: "/", icon: LayoutGrid },
    {
      title: "알림",
      href: "/notifications",
      icon: Bell,
      alert: counts.notifications,
    },
    { title: "캘린더", href: "/calendar", icon: CalendarDays },
  ];
  // 계약(Leases) merged into the tenant detail (tenant-centric) — no standalone nav.
  const manage: Item[] = [
    { title: "세입자", href: "/tenants", icon: Users, count: counts.tenants },
    {
      title: "매물",
      href: "/properties",
      icon: Building2,
      count: counts.properties,
    },
    { title: "임대인", href: "/landlords", icon: Contact },
  ];

  const billingActive = pathname.startsWith("/payments");

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[232px] flex-col border-r bg-sidebar transition-transform duration-200 ease-out",
          "md:sticky md:top-14 md:z-30 md:h-[calc(100svh-3.5rem)] md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <nav className="scrollbar-none flex-1 overflow-y-auto px-2.5 py-3">
          <GroupLabel>개요</GroupLabel>
          <div className="flex flex-col gap-0.5">
            {overview.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={onClose}
              />
            ))}
          </div>

          <div className="mt-3">
            <GroupLabel>관리</GroupLabel>
            <div className="flex flex-col gap-0.5">
              {manage.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={onClose}
                />
              ))}
            </div>
          </div>

          <div className="mt-3">
            <GroupLabel>정산</GroupLabel>
            <div className="flex flex-col gap-0.5">
              {/* Expandable: 수납 */}
              <button
                type="button"
                onClick={() => setBillingOpen((v) => !v)}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                  billingActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                aria-expanded={billingOpen}
              >
                <CreditCard
                  className="size-[17px] shrink-0"
                  strokeWidth={1.8}
                />
                <span className="flex-1 truncate text-left">수납</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    billingOpen && "rotate-180",
                  )}
                />
              </button>
              {billingOpen && (
                <div className="flex flex-col gap-0.5">
                  <Link
                    href="/payments?status=pending"
                    onClick={onClose}
                    className="ml-[26px] flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                    <span className="flex-1 truncate">미납 현황</span>
                    {counts.unpaid > 0 && (
                      <span className="tabular inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-danger px-1.5 text-[10.5px] font-semibold text-white">
                        {counts.unpaid}
                      </span>
                    )}
                  </Link>
                  <Link
                    href="/payments?type=deposit"
                    onClick={onClose}
                    className="ml-[26px] flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                    <span className="flex-1 truncate">보증금</span>
                  </Link>
                </div>
              )}

              <NavItem
                item={{
                  title: "환율",
                  href: "/exchange-rate",
                  icon: ArrowLeftRight,
                }}
                pathname={pathname}
                onNavigate={onClose}
              />
              <NavItem
                item={{
                  title: "AS 요청",
                  href: "/services",
                  icon: Wrench,
                  alert: counts.services,
                }}
                pathname={pathname}
                onNavigate={onClose}
              />
            </div>
          </div>
        </nav>

        <div className="border-t p-2.5">
          <NavItem
            item={{ title: "설정", href: "/settings", icon: Settings }}
            pathname={pathname}
            onNavigate={onClose}
          />
        </div>
      </aside>
    </>
  );
}
