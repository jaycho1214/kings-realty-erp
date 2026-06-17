"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { useCreateDialog } from "@/components/create-dialog";
import { createServiceRequest, updateServiceRequest } from "../_actions";
import {
  ServiceAssignmentFields,
  type UserOption,
  type VendorOption,
} from "./service-assignment-fields";

const STATUSES = [
  { value: "received", label: "접수" },
  { value: "pending_repair", label: "수리대기중" },
  { value: "in_progress", label: "수리중" },
  { value: "completed", label: "수리완료" },
  { value: "postponed", label: "수리연기" },
  { value: "self_handled", label: "개인처리결정" },
];

const BEARERS = [
  { value: "", label: "미지정" },
  { value: "landlord", label: "임대인" },
  { value: "tenant", label: "임차인" },
  { value: "office", label: "중개" },
];

const fieldSelectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

interface LeaseOption {
  id: number;
  tenant_name: string;
  address: string;
}

interface CategoryOption {
  value: string;
  label: string;
}

interface ServiceFormProps {
  defaultValues?: {
    lease_id?: number;
    title?: string;
    description?: string;
    category?: string;
    status?: string;
    cost_krw?: string | number | null;
    location?: string | null;
    bearer?: string | null;
    assignee_user_ids?: number[];
    vendor_name?: string | null;
    vendor_phone?: string | null;
    landlord_self?: boolean;
    scheduled_date?: string | null;
    estimated_cost?: string | number | null;
    actual_cost?: string | number | null;
    postpone_reason?: string | null;
    escalated_to_landlord?: boolean;
    notes?: string | null;
  };
  serviceId?: number;
  variant?: "card" | "plain";
  leases?: LeaseOption[];
  categories?: CategoryOption[];
  users?: UserOption[];
  vendors?: VendorOption[];
}

export function ServiceForm({
  defaultValues,
  serviceId,
  variant = "card",
  leases = [],
  categories = [],
  users = [],
  vendors = [],
}: ServiceFormProps) {
  const isEditMode = !!serviceId;
  const router = useRouter();
  const { close: closeDialog } = useCreateDialog();
  const [selectedLeaseId, setSelectedLeaseId] = useState<number | "">(
    defaultValues?.lease_id ?? "",
  );
  const [selectedCategory, setSelectedCategory] = useState(
    defaultValues?.category ?? "",
  );
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  const leaseOptions = leases.map((l) => ({
    value: String(l.id),
    label: l.tenant_name,
    sublabel: l.address,
  }));

  const addImageFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setPhotos((prev) => [...prev, ...imageFiles]);
    for (const file of imageFiles) {
      const url = URL.createObjectURL(file);
      setPreviews((prev) => [...prev, url]);
    }
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addImageFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
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

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateSubmit = (formData: FormData) => {
    if (!selectedLeaseId || !selectedCategory) return;
    formData.set("lease_id", String(selectedLeaseId));
    formData.set("category", selectedCategory);
    setError("");

    startTransition(async () => {
      const serviceRequestId = await createServiceRequest(formData);
      if (!serviceRequestId) {
        setError(
          "AS 요청을 등록하지 못했습니다. 입력값과 권한을 확인해주세요.",
        );
        return;
      }

      // Upload photos in parallel
      if (photos.length > 0) {
        await Promise.all(
          photos.map((file) => {
            const uploadData = new FormData();
            uploadData.append("file", file);
            uploadData.append("entity_type", "service_request");
            uploadData.append("entity_id", serviceRequestId);
            return fetch("/api/upload", { method: "POST", body: uploadData });
          }),
        );
      }

      closeDialog();
      router.push("/services");
    });
  };

  const editAction = serviceId
    ? updateServiceRequest.bind(null, serviceId)
    : undefined;

  const categorySelector = (
    <Field>
      <Label>
        카테고리 <span className="text-danger">*</span>
      </Label>
      <Select
        value={selectedCategory}
        onValueChange={(v) => v && setSelectedCategory(v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="선택" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name="category" value={selectedCategory} />
    </Field>
  );

  const photoUpload = (
    <div className="space-y-2">
      <Label>사진</Label>
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div
              key={i}
              className="group relative size-20 overflow-hidden rounded-lg border"
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
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm transition-colors",
          isDragging
            ? "border-primary bg-primary/5 text-primary"
            : "border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
        )}
      >
        <ImagePlus className="size-4" />
        <span>
          {previews.length > 0 ? "사진 추가" : "클릭 또는 드래그하여 사진 추가"}
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePhotoSelect}
        />
      </label>
    </div>
  );

  const content = isEditMode ? (
    <form action={editAction}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="title">
              제목 <span className="text-danger">*</span>
            </Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={defaultValues?.title ?? ""}
              placeholder="AS 요청 제목"
            />
          </Field>
          {categorySelector}
        </div>

        <Field>
          <Label htmlFor="description">
            내용 <span className="text-danger">*</span>
          </Label>
          <Textarea
            id="description"
            name="description"
            required
            rows={3}
            defaultValue={defaultValues?.description ?? ""}
            placeholder="AS 요청 상세 내용"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <Label htmlFor="status">상태</Label>
            <select
              id="status"
              name="status"
              defaultValue={defaultValues?.status ?? "received"}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="cost_krw">비용 (₩)</Label>
            <Input
              id="cost_krw"
              name="cost_krw"
              type="number"
              min={0}
              defaultValue={
                defaultValues?.cost_krw != null
                  ? String(defaultValues.cost_krw)
                  : ""
              }
              placeholder="0"
            />
          </Field>
          <Field>
            <Label htmlFor="bearer">비용 부담</Label>
            <select
              id="bearer"
              name="bearer"
              defaultValue={defaultValues?.bearer ?? ""}
              className={fieldSelectClass}
            >
              {BEARERS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <Label htmlFor="location">위치</Label>
            <Input
              id="location"
              name="location"
              defaultValue={defaultValues?.location ?? ""}
              placeholder="예: 화장실"
            />
          </Field>
          <Field>
            <Label htmlFor="scheduled_date">예약(방문)일</Label>
            <Input
              id="scheduled_date"
              name="scheduled_date"
              type="date"
              defaultValue={defaultValues?.scheduled_date ?? ""}
            />
          </Field>
          <Field>
            <Label htmlFor="estimated_cost">예상 비용 (₩)</Label>
            <Input
              id="estimated_cost"
              name="estimated_cost"
              type="number"
              min={0}
              defaultValue={
                defaultValues?.estimated_cost != null
                  ? String(defaultValues.estimated_cost)
                  : ""
              }
              placeholder="0"
            />
          </Field>
          <Field>
            <Label htmlFor="actual_cost">실제 비용 (₩)</Label>
            <Input
              id="actual_cost"
              name="actual_cost"
              type="number"
              min={0}
              defaultValue={
                defaultValues?.actual_cost != null
                  ? String(defaultValues.actual_cost)
                  : defaultValues?.cost_krw != null
                    ? String(defaultValues.cost_krw)
                    : ""
              }
              placeholder="0"
            />
          </Field>
          <Field>
            <Label htmlFor="escalated_to_landlord">임대인 에스컬레이션</Label>
            <select
              id="escalated_to_landlord"
              name="escalated_to_landlord"
              defaultValue={
                defaultValues?.escalated_to_landlord ? "true" : "false"
              }
              className={fieldSelectClass}
            >
              <option value="false">아니오</option>
              <option value="true">예</option>
            </select>
          </Field>
        </div>

        <ServiceAssignmentFields
          users={users}
          vendors={vendors}
          defaultAssigneeIds={defaultValues?.assignee_user_ids}
          defaultVendorName={defaultValues?.vendor_name}
          defaultVendorPhone={defaultValues?.vendor_phone}
          defaultLandlordSelf={defaultValues?.landlord_self}
        />

        <Field>
          <Label htmlFor="postpone_reason">수리연기 사유</Label>
          <Input
            id="postpone_reason"
            name="postpone_reason"
            defaultValue={defaultValues?.postpone_reason ?? ""}
            placeholder="상태가 수리연기/개인처리결정일 때 사유"
          />
        </Field>

        <Field>
          <Label htmlFor="notes">비고</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={defaultValues?.notes ?? ""}
            placeholder="추가 메모"
          />
        </Field>

        <div className="flex justify-end pt-2">
          <SubmitButton label="저장" />
        </div>
      </FieldGroup>
    </form>
  ) : (
    <form action={handleCreateSubmit}>
      <FieldGroup>
        {/* Searchable lease selector */}
        <Field>
          <Label>
            임대 계약 <span className="text-danger">*</span>
          </Label>
          <Combobox
            options={leaseOptions}
            value={selectedLeaseId === "" ? "" : String(selectedLeaseId)}
            onChange={(v) => setSelectedLeaseId(v ? Number(v) : "")}
            placeholder="계약 선택..."
            searchPlaceholder="세입자 또는 주소 검색..."
            emptyText="결과 없음"
            className="w-full"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label htmlFor="title">
              제목 <span className="text-danger">*</span>
            </Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={defaultValues?.title ?? ""}
              placeholder="AS 요청 제목"
            />
          </Field>
          {categorySelector}
        </div>

        <Field>
          <Label htmlFor="description">
            내용 <span className="text-danger">*</span>
          </Label>
          <Textarea
            id="description"
            name="description"
            required
            rows={3}
            defaultValue={defaultValues?.description ?? ""}
            placeholder="AS 요청 상세 내용"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <Label htmlFor="location">위치</Label>
            <Input id="location" name="location" placeholder="예: 화장실" />
          </Field>
          <Field>
            <Label htmlFor="bearer">비용 부담</Label>
            <select
              id="bearer"
              name="bearer"
              defaultValue=""
              className={fieldSelectClass}
            >
              {BEARERS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="scheduled_date">예약(방문)일</Label>
            <Input id="scheduled_date" name="scheduled_date" type="date" />
          </Field>
          <Field>
            <Label htmlFor="estimated_cost">예상 비용 (₩)</Label>
            <Input
              id="estimated_cost"
              name="estimated_cost"
              type="number"
              min={0}
              placeholder="0"
            />
          </Field>
        </div>

        <ServiceAssignmentFields users={users} vendors={vendors} />

        <Field>
          <Label htmlFor="notes">비고</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={defaultValues?.notes ?? ""}
            placeholder="추가 메모"
          />
        </Field>

        {photoUpload}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isPending || !selectedLeaseId || !selectedCategory}
          >
            {isPending ? "등록 중..." : "등록"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );

  if (variant === "plain") return content;

  return (
    <Card>
      <CardContent className="pt-6">{content}</CardContent>
    </Card>
  );
}
