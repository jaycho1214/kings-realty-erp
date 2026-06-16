"use client";

import {
  useState,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const CreateDialogContext = createContext<{ close: () => void }>({
  close: () => {},
});

export function useCreateDialog() {
  return useContext(CreateDialogContext);
}

export function CreateDialog({
  title,
  buttonLabel,
  children,
  wide = false,
  closeOnSuccess = false,
}: {
  title: string;
  buttonLabel: string;
  children: React.ReactNode;
  wide?: boolean;
  closeOnSuccess?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const skipConfirmRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  const hasInput = useCallback(() => {
    if (!formRef.current) return false;
    const els = formRef.current.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select");
    for (const el of els) {
      // Skip hidden inputs that don't back a form field (no name); named
      // hidden inputs hold real values from Combobox/SexToggle and count.
      if (el instanceof HTMLInputElement && el.type === "hidden" && !el.name) {
        continue;
      }
      if (el.value.trim() !== "") return true;
    }
    return false;
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        if (skipConfirmRef.current) {
          skipConfirmRef.current = false;
          setOpen(false);
          return;
        }
        if (hasInput()) {
          setConfirmOpen(true);
          return;
        }
      }
      setOpen(nextOpen);
    },
    [hasInput],
  );

  const handleConfirmClose = useCallback(() => {
    setConfirmOpen(false);
    skipConfirmRef.current = true;
    setOpen(false);
  }, []);

  const closeDialog = useCallback(() => {
    skipConfirmRef.current = true;
    setOpen(false);
  }, []);

  return (
    <>
      <Button className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className={wide ? "sm:max-w-2xl" : "sm:max-w-lg"}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div
            ref={formRef}
            className="-mx-4 max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain px-4"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "var(--color-border) transparent",
            }}
          >
            <CreateDialogContext.Provider
              value={{ close: closeOnSuccess ? closeDialog : () => {} }}
            >
              {children}
            </CreateDialogContext.Provider>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>입력을 취소하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              입력한 내용이 저장되지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 입력</AlertDialogCancel>
            <Button variant="destructive" onClick={handleConfirmClose}>
              닫기
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
