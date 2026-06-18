"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Database, Users, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

const settingsNav = [
  { href: "/settings", label: "일반", icon: Settings },
  { href: "/settings/data", label: "데이터 관리", icon: Database },
  {
    href: "/settings/inspection-checklist",
    label: "점검 체크리스트",
    icon: ClipboardCheck,
  },
  { href: "/settings/users", label: "사용자 관리", icon: Users },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <PageHeader
        title="설정"
        description="앱 환경설정과 기준 데이터를 관리합니다."
      />
      <div className="flex flex-col gap-6">
        <nav className="overflow-x-auto">
          <ul className="inline-flex h-9 items-stretch gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground">
            {settingsNav.map((item) => {
              const isActive =
                item.href === "/settings"
                  ? pathname === "/settings"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href} className="flex">
                  <Link
                    href={item.href}
                    className={cn(
                      "inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all",
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-foreground/60 hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" strokeWidth={1.8} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
