"use client";

import { useState } from "react";
import { Plus, Trash2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/submit-button";
import { addInspection, deleteInspection } from "../../_actions";

const AREAS = ["방", "욕실", "주방", "거실", "가전", "기타"];
const CONDITIONS: Record<string, { label: string; tone: string }> = {
  good: { label: "양호", tone: "text-success" },
  issue: { label: "이상", tone: "text-warning" },
  damage: { label: "파손", tone: "text-danger" },
};
const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

interface ChecklistItem {
  area: string;
  status: string;
  note: string;
}

interface InspectionRow {
  id: number;
  type: string;
  inspected_at: string;
  participants: string | null;
  checklist: string | null;
  summary: string | null;
}

function parseChecklist(json: string | null): ChecklistItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseParticipants(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) ?? {};
  } catch {
    return {};
  }
}

export function Inspections({
  leaseId,
  propertyId,
  inspections,
}: {
  leaseId: number;
  propertyId: number;
  inspections: InspectionRow[];
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>(
    AREAS.map((area) => ({ area, status: "good", note: "" })),
  );

  const moveIn = inspections.find((i) => i.type === "move_in");
  const moveOut = inspections.find((i) => i.type === "move_out");

  async function handleAdd(formData: FormData) {
    formData.set("checklist", JSON.stringify(items));
    formData.set(
      "participants",
      JSON.stringify({
        staff: formData.get("p_staff") ?? "",
        housing: formData.get("p_housing") ?? "",
        tenant: formData.get("p_tenant") ?? "",
      }),
    );
    await addInspection(leaseId, propertyId, formData);
    setOpen(false);
    setItems(AREAS.map((area) => ({ area, status: "good", note: "" })));
  }

  function updateItem(idx: number, patch: Partial<ChecklistItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          점검 추가
        </Button>
      </div>

      {inspections.length === 0 ? (
        <DataPanel>
          <EmptyState
            icon={ClipboardCheck}
            title="점검 기록이 없습니다"
            description="입주 점검 또는 퇴거 점검을 추가하세요."
          />
        </DataPanel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {inspections.map((insp) => (
            <InspectionCard key={insp.id} insp={insp} leaseId={leaseId} />
          ))}
        </div>
      )}

      {moveIn && moveOut && (
        <DataPanel>
          <div className="border-b border-border/60 px-3.5 py-2.5 text-sm font-semibold">
            입주 ↔ 퇴거 비교
          </div>
          <div className="divide-y divide-border/40">
            {AREAS.map((area) => {
              const mi = parseChecklist(moveIn.checklist).find(
                (c) => c.area === area,
              );
              const mo = parseChecklist(moveOut.checklist).find(
                (c) => c.area === area,
              );
              const changed =
                mi && mo && mi.status !== mo.status && mo.status !== "good";
              return (
                <div
                  key={area}
                  className={`grid grid-cols-3 gap-2 px-3.5 py-2 text-sm ${changed ? "bg-danger/5" : ""}`}
                >
                  <span className="font-medium">{area}</span>
                  <span className={CONDITIONS[mi?.status ?? ""]?.tone}>
                    {CONDITIONS[mi?.status ?? ""]?.label ?? "-"}
                  </span>
                  <span className={CONDITIONS[mo?.status ?? ""]?.tone}>
                    {CONDITIONS[mo?.status ?? ""]?.label ?? "-"}
                    {changed && (
                      <span className="ml-1 text-[11px] text-danger">변경</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </DataPanel>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>점검 추가</DialogTitle>
          </DialogHeader>
          <form action={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="type">점검 유형</Label>
                <select id="type" name="type" className={selectClassName}>
                  <option value="move_in">입주 점검</option>
                  <option value="move_out">퇴거 점검</option>
                </select>
              </Field>
              <Field>
                <Label htmlFor="inspected_at">점검 일시</Label>
                <Input
                  id="inspected_at"
                  name="inspected_at"
                  type="date"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field>
                <Label htmlFor="p_staff">우리 직원</Label>
                <Input id="p_staff" name="p_staff" placeholder="직원명" />
              </Field>
              <Field>
                <Label htmlFor="p_housing">Housing 담당</Label>
                <Input id="p_housing" name="p_housing" placeholder="담당자명" />
              </Field>
              <Field>
                <Label htmlFor="p_tenant">임차인</Label>
                <Input id="p_tenant" name="p_tenant" placeholder="임차인명" />
              </Field>
            </div>

            <div>
              <Label>체크리스트</Label>
              <div className="mt-1.5 space-y-1.5">
                {items.map((item, idx) => (
                  <div
                    key={item.area}
                    className="grid grid-cols-[80px_120px_1fr] gap-2"
                  >
                    <span className="flex h-8 items-center text-sm font-medium">
                      {item.area}
                    </span>
                    <select
                      value={item.status}
                      onChange={(e) =>
                        updateItem(idx, { status: e.target.value })
                      }
                      className={selectClassName}
                    >
                      <option value="good">양호</option>
                      <option value="issue">이상</option>
                      <option value="damage">파손</option>
                    </select>
                    <Input
                      value={item.note}
                      onChange={(e) =>
                        updateItem(idx, { note: e.target.value })
                      }
                      placeholder="메모"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Field>
              <Label htmlFor="summary">종합 의견</Label>
              <Textarea
                id="summary"
                name="summary"
                rows={2}
                placeholder="종합 의견"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
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
    </div>
  );
}

function InspectionCard({
  insp,
  leaseId,
}: {
  insp: InspectionRow;
  leaseId: number;
}) {
  const checklist = parseChecklist(insp.checklist);
  const participants = parseParticipants(insp.participants);
  const deleteAction = deleteInspection.bind(null, insp.id, leaseId);
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={insp.type === "move_in" ? "default" : "secondary"}>
            {insp.type === "move_in" ? "입주 점검" : "퇴거 점검"}
          </Badge>
          <span className="tabular text-sm text-muted-foreground">
            {new Date(insp.inspected_at).toLocaleDateString("ko-KR")}
          </span>
        </div>
        <form action={deleteAction}>
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label="삭제"
          >
            <Trash2 className="size-3.5 text-danger" />
          </Button>
        </form>
      </div>
      {(participants.staff || participants.housing || participants.tenant) && (
        <div className="mt-2 text-xs text-muted-foreground">
          참여:{" "}
          {[participants.staff, participants.housing, participants.tenant]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
      <div className="mt-2 space-y-1">
        {checklist.map((c) => (
          <div key={c.area} className="flex items-center gap-2 text-sm">
            <span className="w-12 text-muted-foreground">{c.area}</span>
            <span className={CONDITIONS[c.status]?.tone}>
              {CONDITIONS[c.status]?.label ?? c.status}
            </span>
            {c.note && (
              <span className="truncate text-xs text-muted-foreground">
                {c.note}
              </span>
            )}
          </div>
        ))}
      </div>
      {insp.summary && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
          {insp.summary}
        </p>
      )}
    </div>
  );
}
