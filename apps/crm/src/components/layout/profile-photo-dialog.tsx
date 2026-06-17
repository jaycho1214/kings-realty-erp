"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const MAX_DIM = 512;

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

export function ProfilePhotoDialog({
  open,
  onOpenChange,
  currentImage,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentImage: string | null;
  name: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = name.slice(0, 2);
  const shownImage = preview ?? currentImage;

  const close = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPendingFile(null);
    setError(null);
    setBusy(false);
    onOpenChange(false);
  };

  const handlePick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const resized = await resizeToSquareWebp(file);
      setPendingFile(resized);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(resized);
      });
    } catch {
      setError("이미지를 처리할 수 없습니다.");
    }
  };

  const handleSave = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const res = await fetch("/api/profile/photo", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "업로드에 실패했습니다.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      const { error: updateError } = await authClient.updateUser({ image: url });
      if (updateError) {
        setError("프로필 사진 저장에 실패했습니다.");
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("업로드 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await authClient.updateUser({
        image: null,
      });
      if (updateError) {
        setError("삭제에 실패했습니다.");
        return;
      }
      await fetch("/api/profile/photo", { method: "DELETE" }).catch(() => {});
      close();
      router.refresh();
    } catch {
      setError("삭제 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>프로필 사진</DialogTitle>
          <DialogDescription>
            JPG, PNG, WebP · 정사각형으로 자동 변환됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            사진 선택
          </Button>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          {currentImage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={handleRemove}
              disabled={busy}
            >
              사진 삭제
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={close}
              disabled={busy}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={busy || !pendingFile}
            >
              {busy ? "저장 중..." : "저장"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
