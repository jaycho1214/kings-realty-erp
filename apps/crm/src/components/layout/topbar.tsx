"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Menu, Bell, ChevronDown, LogOut, Download } from "lucide-react";

const CommandMenu = dynamic(
  () => import("@/components/layout/command-menu").then((m) => m.CommandMenu),
  {
    ssr: false,
    loading: () => (
      <div className="hidden h-9 w-56 items-center gap-2 rounded-lg border bg-secondary px-3 text-sm text-muted-foreground md:inline-flex">
        <span className="flex-1 text-left">검색...</span>
      </div>
    ),
  },
);

import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const { data: session } = useSession();

  const name = session?.user?.name ?? "사용자";
  const email = session?.user?.email ?? "";
  const initials = name.slice(0, 2);

  function handleSignOut() {
    signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/sign-in");
          router.refresh();
        },
      },
    });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4 md:px-5">
      <button
        type="button"
        onClick={onMenu}
        aria-label="메뉴 열기"
        className="-ml-1 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Link href="/" className="flex items-center gap-2">
        <Image
          src="/logo.png"
          alt=""
          width={28}
          height={28}
          className="size-7"
          priority
        />
        <span className="text-xl font-semibold tracking-tight">
          King&apos;s
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden md:block">
          <CommandMenu />
        </div>

        <Link href="/settings/data" className="hidden lg:inline-flex">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="size-4" />
            내보내기
          </Button>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground"
        >
          <Bell className="size-[18px]" />
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-danger ring-2 ring-background" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="h-8 gap-1 px-1.5" />
            }
          >
            <Avatar className="size-6">
              <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-indigo-700 text-[10px] font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" className="w-56">
            <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
              <Avatar className="size-8">
                <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-indigo-700 text-xs font-semibold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {email}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
