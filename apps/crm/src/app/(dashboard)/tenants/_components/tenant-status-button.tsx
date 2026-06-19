"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { LogOut, UserCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { seoulDateString } from "@/lib/date";
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

  // Move-out archives the tenant. Let the user pick the actual move-out date
  // (defaults to today) instead of always stamping "now".
  const [open, setOpen] = useState(false);
  const [movedOutOn, setMovedOutOn] = useState(() => seoulDateString());
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(movedOutOn);

  if (isActive) {
    return (
      <>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          disabled={isPending}
          onClick={() => {
            setMovedOutOn(seoulDateString());
            setOpen(true);
          }}
        >
          <LogOut className="size-4" />
          퇴거 처리
        </Button>

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                세입자를 퇴거 처리하시겠습니까?
              </AlertDialogTitle>
              <AlertDialogDescription>
                퇴거 처리하면 세입자가 비활성 상태로 전환됩니다. 이후 입주
                복원으로 되돌릴 수 있습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <Label htmlFor="moved-out-on">퇴거일</Label>
              <Input
                id="moved-out-on"
                type="date"
                value={movedOutOn}
                max={seoulDateString()}
                onChange={(e) => setMovedOutOn(e.target.value)}
              />
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={!valid || isPending}
                onClick={() =>
                  startTransition(async () => {
                    await updateTenantStatus(tenantId, "inactive", movedOutOn);
                    setOpen(false);
                  })
                }
              >
                {isPending ? "처리 중..." : "퇴거 처리"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
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
