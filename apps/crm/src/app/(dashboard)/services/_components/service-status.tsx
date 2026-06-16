"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { changeServiceRequestStatus } from "../_actions";

const STATUSES = [
  { value: "received", label: "접수" },
  { value: "pending_repair", label: "수리대기중" },
  { value: "in_progress", label: "수리중" },
  { value: "completed", label: "수리완료" },
  { value: "postponed", label: "수리연기" },
  { value: "self_handled", label: "개인처리결정" },
];

interface StatusLogImage {
  id: number;
  file_url: string;
  file_name: string;
}

interface StatusLog {
  id: number;
  status: string;
  changed_by_name: string;
  note: string | null;
  created_at: string;
  images?: StatusLogImage[];
}

interface ServiceStatusProps {
  serviceRequestId: number;
  currentStatus: string;
  logs: StatusLog[];
}

const statusLabel: Record<string, string> = {
  received: "접수",
  pending_repair: "수리대기중",
  in_progress: "수리중",
  completed: "수리완료",
  postponed: "수리연기",
  self_handled: "개인처리결정",
  // legacy values
  escalated: "에스컬레이션",
  cancelled: "취소",
};

export function ServiceStatus({
  serviceRequestId,
  currentStatus,
  logs,
}: ServiceStatusProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const addImageFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setPhotos((prev) => [...prev, ...imageFiles]);
    for (const file of imageFiles) {
      setPreviews((prev) => [...prev, URL.createObjectURL(file)]);
    }
  }, []);

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addImageFiles(Array.from(e.dataTransfer.files));
    },
    [addImageFiles],
  );

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addImageFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleSubmit = () => {
    if (!selectedStatus || selectedStatus === currentStatus) return;
    const currentPhotos = [...photos];

    startTransition(async () => {
      const logId = await changeServiceRequestStatus(
        serviceRequestId,
        selectedStatus,
        note,
      );

      if (logId && currentPhotos.length > 0) {
        await Promise.all(
          currentPhotos.map((file) => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("entity_type", "service_request_status_log");
            formData.append("entity_id", logId);
            return fetch("/api/upload", { method: "POST", body: formData });
          }),
        );
        // The action's revalidatePath ran before these uploads inserted their
        // document rows, so refresh to surface the new photos in the timeline.
        router.refresh();
      }

      setNote("");
      setSelectedStatus("");
      for (const url of previews) URL.revokeObjectURL(url);
      setPhotos([]);
      setPreviews([]);
    });
  };

  const availableStatuses = STATUSES.filter((s) => s.value !== currentStatus);

  return (
    <div className="space-y-6">
      {/* Status change form */}
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">현재 상태</span>
          <StatusBadge
            status={currentStatus}
            label={statusLabel[currentStatus] ?? currentStatus}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>변경할 상태</Label>
            <Select
              value={selectedStatus}
              onValueChange={(v) => v && setSelectedStatus(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="상태 선택..." />
              </SelectTrigger>
              <SelectContent>
                {availableStatuses.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>변경 사유</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="변경 사유 (선택)"
              rows={1}
            />
          </div>
        </div>

        {/* Photo previews */}
        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div
                key={i}
                className="group relative size-16 overflow-hidden rounded-lg border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Photo drop zone */}
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-2.5 text-sm transition-colors",
            isDragging
              ? "border-primary bg-primary/5 text-primary"
              : "border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
          )}
        >
          <ImagePlus className="size-4" />
          <span>
            {previews.length > 0
              ? "사진 추가"
              : "클릭 또는 드래그하여 사진 첨부"}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </label>

        {/* Submit */}
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={
              isPending || !selectedStatus || selectedStatus === currentStatus
            }
            onClick={handleSubmit}
          >
            {isPending ? "변경 중..." : "상태 변경"}
          </Button>
        </div>
      </div>

      {/* Status history timeline */}
      {logs.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">변경 이력</p>
          <div className="space-y-0">
            {logs.map((log, i) => (
              <div key={log.id} className="relative flex gap-3 pb-4">
                {/* Timeline line */}
                {i < logs.length - 1 && (
                  <div className="absolute left-[7px] top-5 h-[calc(100%-8px)] w-px bg-border" />
                )}
                {/* Dot */}
                <div
                  className={cn(
                    "mt-1.5 size-[15px] shrink-0 rounded-full border-2",
                    log.status === "completed"
                      ? "border-success bg-success"
                      : log.status === "cancelled"
                        ? "border-danger bg-danger"
                        : "border-border bg-background",
                  )}
                />
                {/* Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={log.status}
                      label={statusLabel[log.status] ?? log.status}
                    />
                    <span className="text-xs text-muted-foreground">
                      {log.changed_by_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {log.note && (
                    <p className="text-sm text-muted-foreground">{log.note}</p>
                  )}
                  {log.images && log.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {log.images.map((img) => (
                        <a
                          key={img.id}
                          href={`/api/documents/${img.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block size-14 overflow-hidden rounded-md border transition-opacity hover:opacity-80"
                        >
                          <Image
                            src={`/api/documents/${img.id}`}
                            alt={img.file_name}
                            width={56}
                            height={56}
                            unoptimized
                            className="size-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
