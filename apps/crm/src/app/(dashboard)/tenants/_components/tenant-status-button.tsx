"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, UserCheck } from "lucide-react";
import { updateTenantStatus } from "../_actions";

interface TenantStatusButtonProps {
  tenantId: number;
  currentStatus: string;
}

export function TenantStatusButton({
  tenantId,
  currentStatus,
}: TenantStatusButtonProps) {
  const [isPending, startTransition] = useTransition();

  const isActive = currentStatus === "active";

  const handleClick = () => {
    startTransition(async () => {
      await updateTenantStatus(tenantId, isActive ? "inactive" : "active");
    });
  };

  return (
    <Button
      type="button"
      variant={isActive ? "outline" : "default"}
      size="sm"
      className="w-full gap-1.5"
      disabled={isPending}
      onClick={handleClick}
    >
      {isActive ? (
        <>
          <LogOut className="size-3.5" />
          {isPending ? "처리 중..." : "퇴거 처리"}
        </>
      ) : (
        <>
          <UserCheck className="size-3.5" />
          {isPending ? "처리 중..." : "입주 복원"}
        </>
      )}
    </Button>
  );
}
