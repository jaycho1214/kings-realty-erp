"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ClipboardCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/submit-button";
import { parseSnapshot } from "@/lib/inspection/parse";
import { compareInspections } from "@/lib/inspection/compare";
import { STATUS_LABEL } from "@/lib/inspection/labels";
import { createInspectionDraft, deleteInspection } from "../_actions";

interface InspectionRow {
  id: number;
  type: string;
  status: string;
  inspected_at: string;
  checklist: string | null;
  summary: string | null;
}

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function Inspections({
  tenantId,
  leaseId,
  propertyId,
  inspections,
}: {
  tenantId: number;
  leaseId: number | null;
  propertyId: number | null;
  inspections: InspectionRow[];
}) {
  const [open, setOpen] = useState(false);

  if (leaseId == null || propertyId == null) {
    return (
      <DataPanel>
        <p className="px-3.5 py-8 text-center text-sm text-muted-foreground">
          계약을 먼저 등록한 뒤 입주/퇴거 점검을 기록할 수 있습니다.
        </p>
      </DataPanel>
    );
  }

  const createAction = createInspectionDraft.bind(
    null,
    tenantId,
    leaseId,
    propertyId,
  );
  const moveIn = inspections.find((i) => i.type === "move_in");
  const moveOut = inspections.find((i) => i.type === "move_out");
  const comparison =
    moveIn && moveOut
      ? compareInspections(
          parseSnapshot(moveIn.checklist),
          parseSnapshot(moveOut.checklist),
        )
      : [];
  const worsened = comparison.filter((r) => r.worsened);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> 점검 추가
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
          {inspections.map((insp) => {
            const snap = parseSnapshot(insp.checklist);
            const counts = snap.sections
              .flatMap((s) => s.items)
              .reduce(
                (acc, it) => {
                  if (it.status === "issue") acc.issue += 1;
                  if (it.status === "damage") acc.damage += 1;
                  return acc;
                },
                { issue: 0, damage: 0 },
              );
            const del = deleteInspection.bind(null, insp.id, tenantId);
            return (
              <div
                key={insp.id}
                className="rounded-lg border border-border/60 bg-card p-3.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={insp.type === "move_in" ? "default" : "secondary"}
                    >
                      {insp.type === "move_in" ? "입주 점검" : "퇴거 점검"}
                    </Badge>
                    {insp.status === "draft" && (
                      <Badge variant="outline">작성 중</Badge>
                    )}
                    <span className="tabular text-sm text-muted-foreground">
                      {new Date(insp.inspected_at).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <ConfirmActionButton
                    action={del}
                    label=""
                    ariaLabel="삭제"
                    icon={<Trash2 className="size-3.5 text-danger" />}
                    variant="ghost"
                    size="icon-sm"
                    confirmWord="삭제"
                    confirmLabel="삭제"
                    title="점검 기록을 삭제하시겠습니까?"
                    description="점검 기록과 첨부된 사진이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
                    pendingLabel="삭제 중..."
                  />
                </div>
                <div className="mt-2 flex items-center gap-3 text-sm tabular-nums">
                  {counts.issue > 0 && (
                    <span className="text-warning">이상 {counts.issue}</span>
                  )}
                  {counts.damage > 0 && (
                    <span className="text-danger">파손 {counts.damage}</span>
                  )}
                  {counts.issue === 0 && counts.damage === 0 && (
                    <span className="text-muted-foreground">특이사항 없음</span>
                  )}
                </div>
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/inspections/${insp.id}`} />}
                  >
                    {insp.status === "draft" ? "이어서 작성" : "열기"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {moveIn && moveOut && (
        <DataPanel>
          <div className="border-b border-border/60 px-3.5 py-2.5 text-sm font-semibold">
            입주 ↔ 퇴거 비교{" "}
            {worsened.length > 0 && (
              <span className="text-danger">· 악화 {worsened.length}건</span>
            )}
          </div>
          {worsened.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-muted-foreground">
              악화된 항목이 없습니다.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {worsened.map((r) => (
                <div
                  key={`${r.key}-${r.instance ?? 0}-${r.label_ko}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-2 bg-danger-weak/40 px-3.5 py-2 text-sm"
                >
                  <span>
                    {r.label_ko}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {r.sectionLabelKo}
                      {r.instance != null ? ` ${r.instance}` : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-xs">
                    <span className="text-muted-foreground">
                      {STATUS_LABEL[r.from]}
                    </span>
                    <span className="mx-1 text-muted-foreground">→</span>
                    <span className="font-medium text-danger">
                      {STATUS_LABEL[r.to]}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </DataPanel>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>점검 추가</DialogTitle>
          </DialogHeader>
          <form action={createAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="type">점검 유형</Label>
              <select id="type" name="type" className={selectClassName}>
                <option value="move_in">입주 점검</option>
                <option value="move_out">퇴거 점검</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspected_at">점검 일시</Label>
              <Input id="inspected_at" name="inspected_at" type="date" required />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <SubmitButton label="작성 시작" />
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
