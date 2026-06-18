"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import type { PhotoRef } from "@/lib/inspection/types";

export function InspectionPhotos({
  inspectionId,
  photos,
  onAdd,
  onRemove,
  size = "md",
}: {
  inspectionId: number;
  photos: PhotoRef[];
  onAdd: (photo: PhotoRef) => void;
  onRemove: (id: number) => void;
  size?: "sm" | "md";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const thumb = size === "sm" ? "size-12" : "size-16";

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entity_type", "inspection");
        fd.append("entity_id", String(inspectionId));
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? "업로드에 실패했습니다.");
          break;
        }
        const data = (await res.json()) as { id: number; url: string };
        onAdd({ id: data.id, url: `/api/documents/${data.id}` });
      }
    } catch {
      setError("업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {photos.map((p) => (
          <div
            key={p.id}
            className={`group relative ${thumb} overflow-hidden rounded-md border`}
          >
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt="점검 사진"
                className="size-full object-cover"
              />
            </a>
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              aria-label="사진 삭제"
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`flex ${thumb} items-center justify-center rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50`}
          aria-label="사진 추가"
        >
          <Camera className="size-4" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {uploading && (
        <p className="text-[11px] text-muted-foreground">업로드 중...</p>
      )}
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
