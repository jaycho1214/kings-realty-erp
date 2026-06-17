"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const MAX_DIM = 512;
const MIN_PASSWORD_LENGTH = 8;

// Center-crop to a square, downscale to <=512px, re-encode as webp. Keeps the
// stored blob tiny and consistent regardless of the source image.
async function resizeToSquareWebp(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const dim = Math.min(side, MAX_DIM);
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, dim, dim);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/webp",
      0.9,
    ),
  );
  return new File([blob], "avatar.webp", { type: "image/webp" });
}

export function EditProfileDialog({
  open,
  onOpenChange,
  currentName,
  currentImage,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  currentImage: string | null;
  email: string;
}) {
  // The form lives in a child that mounts fresh each time the dialog opens, so
  // its state always resets to the current profile — no reset effect needed.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
        <EditProfileForm
          currentName={currentName}
          currentImage={currentImage}
          email={email}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditProfileForm({
  currentName,
  currentImage,
  email,
  onClose,
}: {
  currentName: string;
  currentImage: string | null;
  email: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Profile (name + photo) — applied together on 저장.
  const [name, setName] = useState(currentName);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password — independent section with its own action.
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const initials = (name || currentName).slice(0, 2);
  const shownImage = preview ?? (removePhoto ? null : currentImage);

  // Revoke the object URL of a superseded/last preview when it changes or the
  // form unmounts (dialog closed). Cleanup-only — no setState in the effect.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handlePick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    setProfileError(null);
    try {
      const resized = await resizeToSquareWebp(file);
      setPendingFile(resized);
      setRemovePhoto(false);
      setPreview(URL.createObjectURL(resized));
    } catch {
      setProfileError("이미지를 처리할 수 없습니다.");
    }
  };

  const stageRemove = () => {
    setPendingFile(null);
    setPreview(null);
    setRemovePhoto(true);
  };

  const handleSaveProfile = async () => {
    setProfileBusy(true);
    setProfileError(null);
    try {
      // Resolve the image change first (upload or removal), then persist name +
      // image in a single updateUser call.
      let imageUpdate: string | null | undefined;
      if (pendingFile) {
        const formData = new FormData();
        formData.append("file", pendingFile);
        const res = await fetch("/api/profile/photo", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setProfileError(data?.error ?? "업로드에 실패했습니다.");
          return;
        }
        imageUpdate = ((await res.json()) as { url: string }).url;
      } else if (removePhoto && currentImage) {
        // Delete the blob while the session still references it, then clear the
        // column below — avoids orphaning the blob.
        await fetch("/api/profile/photo", { method: "DELETE" }).catch(() => {});
        imageUpdate = null;
      }

      const trimmedName = name.trim();
      if (!trimmedName) {
        setProfileError("이름을 입력하세요.");
        return;
      }

      const payload: { name?: string; image?: string | null } = {};
      if (trimmedName !== currentName) payload.name = trimmedName;
      if (imageUpdate !== undefined) payload.image = imageUpdate;

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      const { error } = await authClient.updateUser(payload);
      if (error) {
        setProfileError("저장에 실패했습니다.");
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setProfileError("저장 중 오류가 발생했습니다.");
    } finally {
      setProfileBusy(false);
    }
  };

  const handleChangePassword = async () => {
    setPwError(null);
    setPwSuccess(false);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPwError(`새 비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwBusy(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });
      if (error) {
        setPwError("현재 비밀번호가 올바르지 않거나 변경에 실패했습니다.");
        return;
      }
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPwError("비밀번호 변경 중 오류가 발생했습니다.");
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>프로필 편집</DialogTitle>
        <DialogDescription>
          이름과 프로필 사진, 비밀번호를 변경할 수 있습니다.
        </DialogDescription>
      </DialogHeader>

      {/* Photo */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!profileBusy) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!profileBusy) handlePick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border border-dashed border-transparent py-3 transition-colors",
          isDragging && "border-primary bg-accent/50",
        )}
      >
        <Avatar className="size-24">
          {shownImage && <AvatarImage src={shownImage} alt="" />}
          <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-indigo-700 text-xl font-semibold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handlePick(e.target.files?.[0])}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={profileBusy}
          >
            사진 선택
          </Button>
          {shownImage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={stageRemove}
              disabled={profileBusy}
            >
              삭제
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          또는 이미지를 여기로 끌어다 놓으세요
        </p>
      </div>

      {/* Name + email */}
      <Field>
        <Label htmlFor="profile-name">이름</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={profileBusy}
          autoComplete="name"
        />
      </Field>
      <Field>
        <Label htmlFor="profile-email">이메일</Label>
        <Input
          id="profile-email"
          value={email}
          readOnly
          disabled
          className="text-muted-foreground"
        />
      </Field>

      {profileError && <p className="text-sm text-danger">{profileError}</p>}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={handleSaveProfile}
          disabled={profileBusy}
        >
          {profileBusy ? "저장 중..." : "저장"}
        </Button>
      </div>

      <Separator />

      {/* Password */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">비밀번호 변경</h3>
          <p className="text-xs text-muted-foreground">
            변경하지 않으려면 비워 두세요.
          </p>
        </div>
        <Field>
          <Label htmlFor="current-password">현재 비밀번호</Label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            disabled={pwBusy}
          />
        </Field>
        <Field>
          <Label htmlFor="new-password">새 비밀번호</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={pwBusy}
          />
        </Field>
        <Field>
          <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={pwBusy}
          />
        </Field>
        {pwError && <p className="text-sm text-danger">{pwError}</p>}
        {pwSuccess && (
          <p className="text-sm text-emerald-600">비밀번호가 변경되었습니다.</p>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleChangePassword}
            disabled={
              pwBusy || !currentPassword || !newPassword || !confirmPassword
            }
          >
            {pwBusy ? "변경 중..." : "비밀번호 변경"}
          </Button>
        </div>
      </div>
    </>
  );
}
