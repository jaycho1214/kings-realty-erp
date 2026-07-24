"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { FormState } from "@/lib/form-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type ButtonProps = React.ComponentProps<typeof Button>;

/**
 * A trigger button that gates an irreversible action behind a typed
 * confirmation: the user must retype `confirmWord` before the confirm button
 * enables. Used for destructive / lifecycle actions (delete, move-out) so they
 * read and behave the same everywhere.
 */
export function ConfirmActionButton({
  action,
  label,
  icon,
  confirmWord,
  title,
  description,
  variant = "destructive",
  size = "lg",
  className,
  pendingLabel = "처리 중...",
  confirmLabel,
  ariaLabel,
}: {
  /**
   * Returns `{ error }` when the action is refused ("계약·원장 내역이 있는
   * 세입자는 삭제할 수 없습니다."). The dialog stays open and shows why —
   * throwing instead would reach the browser with its message stripped.
   */
  action: () => Promise<FormState | void>;
  /** Trigger button text. Pass "" for an icon-only trigger (set `ariaLabel`). */
  label: string;
  icon?: ReactNode;
  /** Word the user must retype to enable the confirm button. */
  confirmWord: string;
  title: string;
  description: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  pendingLabel?: string;
  /** Confirm button label; defaults to `label`, then `confirmWord`. */
  confirmLabel?: string;
  /** Accessible name for an icon-only trigger (when `label` is empty). */
  ariaLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = confirmText.trim() === confirmWord;

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      // A refusal keeps the dialog open with the reason; success unmounts it
      // (the action redirects or revalidates).
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={pending}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {icon}
        {label}
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(next: boolean) => {
          setOpen(next);
          if (!next) {
            setConfirmText("");
            setError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              계속하려면 아래에{" "}
              <span className="font-semibold text-foreground">
                {confirmWord}
              </span>
              라고 입력하세요.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmWord}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmed && !pending) {
                  run();
                }
              }}
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant={variant}
              disabled={!confirmed || pending}
              onClick={run}
            >
              {pending ? pendingLabel : confirmLabel || label || confirmWord}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
