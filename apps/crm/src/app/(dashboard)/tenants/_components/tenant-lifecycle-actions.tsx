"use client";

import { useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restoreTenant, purgeTenant } from "../_actions";

/**
 * Admin-only restore / permanent-delete controls shown in the 보관/휴지통 views.
 */
export function TenantLifecycleActions({
  tenantId,
  deleted,
}: {
  tenantId: number;
  deleted: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex justify-end gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        className="gap-1.5"
        onClick={() => startTransition(() => restoreTenant(tenantId))}
      >
        <RotateCcw className="size-3.5" />
        복원
      </Button>
      {deleted && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          className="gap-1.5 text-danger"
          onClick={() => {
            if (
              confirm("이 세입자를 영구 삭제하시겠습니까? 되돌릴 수 없습니다.")
            ) {
              startTransition(() => purgeTenant(tenantId));
            }
          }}
        >
          <Trash2 className="size-3.5" />
          영구삭제
        </Button>
      )}
    </div>
  );
}
