"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
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

const CONFIRM_WORD = "삭제";

export function DeleteButton({
  action,
  title = "정말 삭제하시겠습니까?",
  description = "이 작업은 되돌릴 수 없습니다.",
}: {
  action: () => Promise<void>;
  title?: string;
  description?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const confirmed = confirmText === CONFIRM_WORD;

  return (
    <>
      <Button
        variant="destructive"
        size="lg"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        삭제
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
              삭제를 확인하려면 아래에{" "}
              <span className="font-semibold text-foreground">
                {CONFIRM_WORD}
              </span>
              를 입력하세요.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!confirmed || pending}
              onClick={() => startTransition(() => action())}
            >
              {pending ? "삭제 중..." : "삭제"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
