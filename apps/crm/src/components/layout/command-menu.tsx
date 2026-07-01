"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  Home,
  FileText,
  CreditCard,
  Wrench,
  ArrowLeftRight,
  Settings,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { Search } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useIsMac } from "@/hooks/use-is-mac";

interface SearchResults {
  tenants: Array<{
    id: number;
    name: string;
    phone: string;
    status: string;
    activeLeaseId: number | null;
  }>;
}

const quickActions: { title: string; href: string; icon: LucideIcon }[] = [
  { title: "새 수납 등록", href: "/payments/new", icon: CreditCard },
  { title: "환율 설정", href: "/exchange-rate", icon: ArrowLeftRight },
  { title: "AS 접수", href: "/services?action=new", icon: Wrench },
  { title: "새 계약", href: "/leases?action=new", icon: FileText },
  { title: "새 세입자", href: "/tenants?action=new", icon: Users },
];

const navItems: { title: string; href: string; icon: LucideIcon }[] = [
  { title: "대시보드", href: "/", icon: Home },
  { title: "세입자", href: "/tenants", icon: Users },
  { title: "계약", href: "/leases", icon: FileText },
  { title: "매물", href: "/properties", icon: Building2 },
  { title: "임대인", href: "/landlords", icon: Users },
  { title: "수납", href: "/payments", icon: CreditCard },
  { title: "환율", href: "/exchange-rate", icon: ArrowLeftRight },
  { title: "AS 요청", href: "/services", icon: Wrench },
  { title: "일정", href: "/calendar", icon: CalendarDays },
  { title: "설정", href: "/settings", icon: Settings },
];

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] =
    React.useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);
  const router = useRouter();
  const isMac = useIsMac();

  // The ⌘K / Ctrl+K listener lives in the topbar (always mounted) rather than
  // here, so the shortcut works before this lazy-loaded chunk finishes loading.
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) {
        setSearchQuery("");
        setSearchResults(null);
        setIsSearching(false);
      }
    },
    [onOpenChange],
  );

  React.useEffect(() => {
    if (!searchQuery) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(searchQuery)}`,
        );
        const data = await res.json();
        setSearchResults(data.results ?? null);
      } catch {
        setSearchResults(null);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelect = React.useCallback(
    (href: string) => {
      handleOpenChange(false);
      router.push(href);
    },
    [router, handleOpenChange],
  );

  // ⌘↵ / Ctrl+↵ on the highlighted tenant jumps straight to recording a
  // payment. Read the destination off the selected item so it stays in sync
  // with cmdk's own keyboard navigation. Capture phase runs before cmdk's
  // plain-Enter handler.
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const selected = document.querySelector<HTMLElement>(
          '[data-slot="command-item"][data-selected="true"]',
        );
        const href = selected?.getAttribute("data-payment-href");
        if (href) {
          e.preventDefault();
          e.stopPropagation();
          handleSelect(href);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, handleSelect]);

  const hasSearchQuery = searchQuery.length > 0;
  const tenants = searchResults?.tenants ?? [];
  const hasResults = tenants.length > 0;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(true)}
        className="w-56 justify-start gap-2 text-muted-foreground"
      >
        <Search />
        <span className="flex-1 text-left">검색...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="명령 팔레트"
        description="세입자를 검색하거나 빠른 실행을 선택하세요"
      >
        <Command
          shouldFilter={false}
          className="[&_[cmdk-item]]:bg-transparent [&_[cmdk-item][data-selected=true]]:bg-muted"
        >
          <CommandInput
            placeholder="세입자 이름 검색..."
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>
              {isSearching ? "검색 중..." : "검색 결과가 없습니다"}
            </CommandEmpty>

            {hasSearchQuery && hasResults && (
              <>
                <CommandGroup heading="세입자">
                  {tenants.map((tenant) => {
                    const paymentHref =
                      tenant.activeLeaseId != null
                        ? `/payments/new?lease=${tenant.activeLeaseId}`
                        : null;
                    return (
                      <CommandItem
                        key={`tenant-${tenant.id}`}
                        value={`tenant ${tenant.name} ${tenant.phone}`}
                        data-payment-href={paymentHref ?? undefined}
                        onSelect={() => handleSelect(`/tenants/${tenant.id}`)}
                      >
                        <Users />
                        <span className="truncate">{tenant.name}</span>
                        <span
                          data-slot="command-shortcut"
                          className="ml-auto flex items-center gap-2"
                        >
                          <span className="text-xs tracking-widest text-muted-foreground">
                            {tenant.phone}
                          </span>
                          {paymentHref && (
                            <button
                              type="button"
                              aria-label={`${tenant.name} 수납 등록`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleSelect(paymentHref);
                              }}
                              className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                            >
                              <CreditCard className="size-3!" />
                              수납
                            </button>
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>

                <CommandSeparator />
              </>
            )}

            <CommandGroup heading="빠른 실행">
              {quickActions
                .filter(
                  (action) =>
                    !hasSearchQuery ||
                    action.title
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase()),
                )
                .map((action) => (
                  <CommandItem
                    key={action.href}
                    value={action.title}
                    onSelect={() => handleSelect(action.href)}
                  >
                    <action.icon />
                    {action.title}
                  </CommandItem>
                ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="페이지">
              {navItems
                .filter(
                  (item) =>
                    !hasSearchQuery ||
                    item.title
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase()),
                )
                .map((item) => (
                  <CommandItem
                    key={item.href}
                    value={item.title}
                    onSelect={() => handleSelect(item.href)}
                  >
                    <item.icon />
                    {item.title}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>

          {hasResults && (
            <div className="flex items-center justify-end gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1 font-mono">↵</kbd>
                상세
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1 font-mono">
                  {isMac ? "⌘↵" : "Ctrl ↵"}
                </kbd>
                수납
              </span>
            </div>
          )}
        </Command>
      </CommandDialog>
    </>
  );
}
