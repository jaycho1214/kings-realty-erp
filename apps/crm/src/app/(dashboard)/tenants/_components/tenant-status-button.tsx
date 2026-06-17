"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, UserCheck } from "lucide-react";
import { ConfirmActionButton } from "@/components/confirm-action-button";
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

  // Move-out deactivates the tenant: gate it behind a typed confirmation, the
  // same pattern as delete.
  if (isActive) {
    return (
      <ConfirmActionButton
        action={async () => {
          await updateTenantStatus(tenantId, "inactive");
        }}
        label="퇴거 처리"
        icon={<LogOut className="size-4" />}
        confirmWord="퇴거"
        title="세입자를 퇴거 처리하시겠습니까?"
        description="퇴거 처리하면 세입자가 비활성 상태로 전환됩니다. 이후 입주 복원으로 되돌릴 수 있습니다."
        pendingLabel="처리 중..."
      />
    );
  }

  // Restore is reversible and non-destructive, so it runs directly.
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await updateTenantStatus(tenantId, "active");
        })
      }
    >
      <UserCheck className="size-4" />
      {isPending ? "처리 중..." : "입주 복원"}
    </Button>
  );
}
