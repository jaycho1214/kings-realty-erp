"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { deleteDocument } from "@/app/(dashboard)/_actions";

interface Document {
  id: number;
  file_name: string;
  file_url: string;
  file_type: string;
  title: string | null;
  comments: string | null;
  created_at: Date | string;
}

interface DocumentListProps {
  entityType: string;
  entityId: string | number;
  documents: Document[];
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <ImageIcon className="size-4" />;
  return <FileText className="size-4" />;
}

export function DocumentList({
  entityType,
  entityId,
  documents,
}: DocumentListProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [comments, setComments] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const router = useRouter();

  const selectFile = useCallback((file: File) => {
    setSelectedFile(file);
    setShowForm(true);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    selectFile(file);
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
      const file = e.dataTransfer.files[0];
      if (file) selectFile(file);
    },
    [selectFile],
  );

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("entity_type", entityType);
      formData.append("entity_id", String(entityId));
      if (title.trim()) formData.append("title", title.trim());
      if (comments.trim()) formData.append("comments", comments.trim());

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        router.refresh();
        resetForm();
      } else {
        const data = await res.json().catch(() => null);
        setUploadError(data?.error ?? "업로드에 실패했습니다.");
      }
    } catch {
      setUploadError("업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setShowForm(false);
    setTitle("");
    setComments("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex items-center justify-between rounded-lg border-2 border-dashed p-3 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/20",
        )}
      >
        <p className="text-xs text-muted-foreground">
          <Upload className="mr-1 inline size-3.5" />
          파일을 드래그하여 놓거나 버튼을 클릭
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          파일 선택
        </Button>
      </div>

      {/* Upload form with title & comments */}
      {showForm && selectedFile && (
        <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              <FileIcon type={selectedFile.type} /> {selectedFile.name}
            </p>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-title">제목</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="문서 제목 (선택)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-comments">메모</Label>
            <Textarea
              id="doc-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="메모 (선택)"
              rows={2}
            />
          </div>
          {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetForm}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={uploading}
              onClick={handleUpload}
            >
              {uploading ? "업로드 중..." : "업로드"}
            </Button>
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          등록된 문서가 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const handleDelete = deleteDocument.bind(
              null,
              doc.id,
              entityType,
              entityId,
            );
            return (
              <div key={doc.id} className="group rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between">
                  <a
                    href={`/api/documents/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline"
                  >
                    <FileIcon type={doc.file_type} />
                    <span>{doc.title || doc.file_name}</span>
                  </a>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString("ko-KR")}
                    </span>
                    <form action={handleDelete}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="size-6 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </form>
                  </div>
                </div>
                {doc.title && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {doc.file_name}
                  </p>
                )}
                {doc.comments && (
                  <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                    {doc.comments}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
