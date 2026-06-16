"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Building2, Clock } from "lucide-react";

export function PendingNotice({ userName }: { userName: string }) {
  const router = useRouter();

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
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2 font-medium">
        <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-sm">
          <Building2 className="size-5" strokeWidth={2} />
        </div>
      </div>

      <div className="flex size-14 items-center justify-center rounded-full bg-warning-weak">
        <Clock className="size-7 text-warning" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">승인 대기 중</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{userName}</span>님,
          가입 신청이 접수되었습니다.
          <br />
          관리자가 승인하면 시스템을 사용할 수 있습니다.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.refresh()}>
          승인 확인
        </Button>
        <Button variant="ghost" onClick={handleSignOut}>
          로그아웃
        </Button>
      </div>
    </div>
  );
}
