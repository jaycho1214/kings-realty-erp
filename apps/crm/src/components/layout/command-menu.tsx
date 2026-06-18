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
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useIsMac } from "@/hooks/use-is-mac";

interface SearchResults {
  tenants: Array<{
    id: number;
    name: string;
    phone: string;
    status: string;
    type: "tenant";
  }>;
  properties: Array<{
    id: number;
    address: string;
    status: string;
    type: "property";
  }>;
  landlords: Array<{
    id: number;
    name: string;
    phone: string;
    type: "landlord";
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

  const hasSearchQuery = searchQuery.length > 0;
  const hasResults =
    searchResults &&
    (searchResults.tenants.length > 0 ||
      searchResults.properties.length > 0 ||
      searchResults.landlords.length > 0);

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
        description="검색하거나 빠른 실행을 선택하세요"
      >
        <Command
          shouldFilter={false}
          className="[&_[cmdk-item]]:bg-transparent [&_[cmdk-item][data-selected=true]]:bg-muted"
        >
          <CommandInput placeholder="검색..." onValueChange={setSearchQuery} />
          <CommandList>
            <CommandEmpty>
              {isSearching ? "검색 중..." : "검색 결과가 없습니다"}
            </CommandEmpty>

            {hasSearchQuery && searchResults && (
              <>
                {searchResults.tenants.length > 0 && (
                  <CommandGroup heading="세입자">
                    {searchResults.tenants.map((tenant) => (
                      <CommandItem
                        key={`tenant-${tenant.id}`}
                        value={`tenant ${tenant.name} ${tenant.phone}`}
                        onSelect={() => handleSelect(`/tenants/${tenant.id}`)}
                      >
                        <Users />
                        {tenant.name}
                        <CommandShortcut>{tenant.phone}</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {searchResults.properties.length > 0 && (
                  <CommandGroup heading="매물">
                    {searchResults.properties.map((property) => (
                      <CommandItem
                        key={`property-${property.id}`}
                        value={`property ${property.address}`}
                        onSelect={() =>
                          handleSelect(`/properties/${property.id}`)
                        }
                      >
                        <Building2 />
                        {property.address}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {searchResults.landlords.length > 0 && (
                  <CommandGroup heading="임대인">
                    {searchResults.landlords.map((landlord) => (
                      <CommandItem
                        key={`landlord-${landlord.id}`}
                        value={`landlord ${landlord.name} ${landlord.phone}`}
                        onSelect={() =>
                          handleSelect(`/landlords/${landlord.id}`)
                        }
                      >
                        <Users />
                        {landlord.name}
                        <CommandShortcut>{landlord.phone}</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {hasResults && <CommandSeparator />}
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
        </Command>
      </CommandDialog>
    </>
  );
}
