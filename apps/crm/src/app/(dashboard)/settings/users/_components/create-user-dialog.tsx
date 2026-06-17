"use client";

import { useState, useRef, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { createUser } from "../_actions";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const handleAction = useCallback(async (formData: FormData) => {
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setError("");
    await createUser(formData);
    setOpen(false);
    formRef.current?.reset();
  }, []);

  return (
    <>
      <Button className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        사용자 추가
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 사용자 추가</DialogTitle>
          </DialogHeader>
          <form ref={formRef} action={handleAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                이름 <span className="text-danger">*</span>
              </Label>
              <Input id="name" name="name" required placeholder="홍길동" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                이메일 <span className="text-danger">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="user@kingsrealty.kr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                비밀번호 <span className="text-danger">*</span>
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="8자 이상"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                비밀번호 확인 <span className="text-danger">*</span>
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                placeholder="비밀번호를 다시 입력하세요"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="role">권한</Label>
              <Select name="role" defaultValue="staff">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">직원</SelectItem>
                  <SelectItem value="accounting">회계</SelectItem>
                  <SelectItem value="admin">관리자</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <SubmitButton label="추가" />
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
