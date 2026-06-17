"use client";

import { useState, useTransition, type ReactNode } from "react";
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
}: {
  action: () => Promise<void>;
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
  /** Confirm button label; defaults to `label`. */
  confirmLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const confirmed = confirmText.trim() === confirmWord;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {icon}
        {label}
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(next: boolean) => {
          setOpen(next);
          if (!next) setConfirmText("");
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
                  startTransition(() => action());
                }
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant={variant}
              disabled={!confirmed || pending}
              onClick={() => startTransition(() => action())}
            >
              {pending ? pendingLabel : (confirmLabel ?? label)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
