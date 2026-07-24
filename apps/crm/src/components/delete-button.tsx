"use client";

import { Trash2 } from "lucide-react";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import type { FormState } from "@/lib/form-action";

export function DeleteButton({
  action,
  title = "정말 삭제하시겠습니까?",
  description = "이 작업은 되돌릴 수 없습니다.",
}: {
  /** Refusals ("…삭제할 수 없습니다.") come back as `{ error }`, not a throw. */
  action: () => Promise<FormState | void>;
  title?: string;
  description?: string;
}) {
  return (
    <ConfirmActionButton
      action={action}
      label="삭제"
      icon={<Trash2 className="size-4" />}
      confirmWord="삭제"
      title={title}
      description={description}
      pendingLabel="삭제 중..."
    />
  );
}
