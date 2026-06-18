"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DataPanel } from "@/components/data-panel";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { INSPECTION_REMINDERS } from "@/lib/inspection/reminders";
import {
  STATUS_LABEL,
  STATUS_ACTIVE_CLASS,
  STATUS_ORDER,
} from "@/lib/inspection/labels";
import type {
  InspectionSnapshot,
  PhotoRef,
  SnapshotItem,
} from "@/lib/inspection/types";
import {
  saveInspection,
  finalizeInspection,
  deleteInspectionPhoto,
} from "../../tenants/_actions";
import { InspectionPhotos } from "../../tenants/_components/inspection-photos";

export function InspectionEditor(props: {
  tenantId: number;
  inspectionId: number;
  type: string;
  status: string;
  inspectedAt: string;
  tenantName: string;
  propertyLabel: string;
  initialSnapshot: InspectionSnapshot;
  initialGallery: PhotoRef[];
  initialSignature: { tenant: string; inspector: string };
  initialSummary: string;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<InspectionSnapshot>(
    props.initialSnapshot,
  );
  const [gallery, setGallery] = useState<PhotoRef[]>(props.initialGallery);
  const [sig, setSig] = useState(props.initialSignature);
  const [summary, setSummary] = useState(props.initialSummary);
  const [pending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  // Items the user opted to expand for a note/photo (beyond the auto-shown ones).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const finalized = props.status === "finalized";
  const listHref = `/tenants/${props.tenantId}/inspections`;

  const firstRender = useRef(true);
  const finalizing = useRef(false);

  // Overall + per-status progress, derived each render.
  const allItems = snapshot.sections.flatMap((s) => s.items);
  const total = allItems.length;
  const checked = allItems.filter((it) => it.status !== "na").length;
  const issueCount = allItems.filter((it) => it.status === "issue").length;
  const damageCount = allItems.filter((it) => it.status === "damage").length;

  function patchItem(
    sectionIdx: number,
    itemId: string,
    patch: Partial<SnapshotItem>,
  ) {
    setSnapshot((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              items: s.items.map((it) =>
                it.id === itemId ? { ...it, ...patch } : it,
              ),
            }
          : s,
      ),
    }));
  }

  function markSectionAllGood(sectionIdx: number) {
    setSnapshot((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIdx
          ? { ...s, items: s.items.map((it) => ({ ...it, status: "good" })) }
          : s,
      ),
    }));
  }

  function buildSignaturePayload(): string {
    const now = new Date().toISOString();
    return JSON.stringify({
      tenant: sig.tenant ? { name: sig.tenant, signed_at: now } : null,
      inspector: sig.inspector ? { name: sig.inspector, signed_at: now } : null,
    });
  }

  function persist(): Promise<void> {
    return saveInspection(props.inspectionId, props.tenantId, {
      checklist: JSON.stringify(snapshot),
      signature: buildSignaturePayload(),
      summary: summary.trim() || null,
    });
  }

  function stampSaved() {
    setLastSavedAt(
      new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    setSaveState("saved");
  }

  // Debounced autosave: a field walkthrough gets interrupted; never lose edits
  // to a missed "임시 저장" tap. Skips the first render and the finalize path.
  useEffect(() => {
    if (finalized || finalizing.current) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      setSaveState("saving");
      persist()
        .then(stampSaved)
        .catch(() => setSaveState("idle"));
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, sig, summary, finalized]);

  function handleSave() {
    startTransition(async () => {
      setSaveState("saving");
      await persist();
      stampSaved();
    });
  }

  function handleFinalize() {
    finalizing.current = true;
    startTransition(async () => {
      await persist();
      await finalizeInspection(props.inspectionId, props.tenantId);
      router.push(listHref);
      router.refresh();
    });
  }

  function addItemPhoto(sectionIdx: number, itemId: string, photo: PhotoRef) {
    setSnapshot((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              items: s.items.map((it) =>
                it.id === itemId
                  ? { ...it, photos: [...it.photos, photo] }
                  : it,
              ),
            }
          : s,
      ),
    }));
  }

  function removeItemPhoto(
    sectionIdx: number,
    itemId: string,
    photoId: number,
  ) {
    setSnapshot((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              items: s.items.map((it) =>
                it.id === itemId
                  ? { ...it, photos: it.photos.filter((p) => p.id !== photoId) }
                  : it,
              ),
            }
          : s,
      ),
    }));
    void deleteInspectionPhoto(photoId, props.inspectionId, props.tenantId);
  }

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title={`${props.type === "move_in" ? "입주" : "퇴거"} 점검`}
        description={`${props.tenantName} · ${props.propertyLabel} · ${new Date(props.inspectedAt).toLocaleDateString("ko-KR")}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href={listHref} />}
            >
              <ArrowLeft className="size-4" /> 목록
            </Button>
            {finalized && <Badge>완료됨</Badge>}
          </div>
        }
      />

      <DataPanel>
        <div className="flex items-start gap-2 border-b border-border/60 bg-warning-weak/50 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 text-warning" />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium">중요사항</p>
            <ul className="list-disc pl-4 text-muted-foreground">
              {INSPECTION_REMINDERS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </DataPanel>

      {snapshot.sections.map((section, sIdx) => {
        const secTotal = section.items.length;
        const secChecked = section.items.filter(
          (it) => it.status !== "na",
        ).length;
        return (
          <DataPanel key={`${section.key}-${section.instance ?? 0}`}>
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
              <div className="text-sm font-semibold">
                {section.label_ko}
                {section.instance != null && ` ${section.instance}`}
                {section.label_en && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {section.label_en}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-xs text-muted-foreground">
                  {secChecked}/{secTotal}
                </span>
                {!finalized && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => markSectionAllGood(sIdx)}
                  >
                    전체 양호
                  </Button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-border/40">
              {section.items.map((item) => {
                const needsPhoto =
                  item.status === "issue" || item.status === "damage";
                const rowVisible =
                  needsPhoto ||
                  item.note.length > 0 ||
                  item.photos.length > 0 ||
                  expanded.has(item.id);
                return (
                  <li key={item.id} className="space-y-2 px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.subgroup_ko && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {item.subgroup_ko}
                        </span>
                      )}
                      <span className="text-sm">{item.label_ko}</span>
                      {item.label_en && (
                        <span className="text-xs text-muted-foreground">
                          {item.label_en}
                        </span>
                      )}
                      {!rowVisible && !finalized && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) =>
                              new Set(prev).add(item.id),
                            )
                          }
                          className="text-xs text-muted-foreground/60 underline-offset-2 hover:text-foreground hover:underline"
                        >
                          메모·사진
                        </button>
                      )}
                      <div className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
                        {STATUS_ORDER.map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={finalized}
                            onClick={() => patchItem(sIdx, item.id, { status: s })}
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-xs transition-colors disabled:opacity-60",
                              item.status === s
                                ? STATUS_ACTIVE_CLASS[s]
                                : "border-transparent text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {rowVisible && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <Input
                          value={item.note}
                          disabled={finalized}
                          onChange={(e) =>
                            patchItem(sIdx, item.id, { note: e.target.value })
                          }
                          placeholder="비고"
                          className="sm:flex-1"
                        />
                        <InspectionPhotos
                          inspectionId={props.inspectionId}
                          photos={item.photos}
                          size="sm"
                          alert={needsPhoto}
                          onAdd={(p) => addItemPhoto(sIdx, item.id, p)}
                          onRemove={(pid) => removeItemPhoto(sIdx, item.id, pid)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </DataPanel>
        );
      })}

      <DataPanel>
        <div className="space-y-3 p-3.5">
          <div className="space-y-1.5">
            <Label>전체 사진 (현장/퇴거 등)</Label>
            <InspectionPhotos
              inspectionId={props.inspectionId}
              photos={gallery}
              onAdd={(p) => setGallery((g) => [...g, p])}
              onRemove={(pid) => {
                setGallery((g) => g.filter((p) => p.id !== pid));
                void deleteInspectionPhoto(
                  pid,
                  props.inspectionId,
                  props.tenantId,
                );
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">특이사항 메모</Label>
            <Textarea
              id="notes"
              rows={3}
              disabled={finalized}
              value={snapshot.notes}
              onChange={(e) =>
                setSnapshot((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="특이사항"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="summary">종합 의견</Label>
            <Textarea
              id="summary"
              rows={2}
              disabled={finalized}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sig-tenant">임차인 서명</Label>
              <Input
                id="sig-tenant"
                disabled={finalized}
                value={sig.tenant}
                onChange={(e) =>
                  setSig((s) => ({ ...s, tenant: e.target.value }))
                }
                placeholder="임차인 성명"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sig-inspector">점검자 서명</Label>
              <Input
                id="sig-inspector"
                disabled={finalized}
                value={sig.inspector}
                onChange={(e) =>
                  setSig((s) => ({ ...s, inspector: e.target.value }))
                }
                placeholder="점검자 성명"
              />
            </div>
          </div>
        </div>
      </DataPanel>

      {!finalized && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/90 px-1 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="tabular-nums text-muted-foreground">
              점검 {checked}/{total}
            </span>
            {issueCount > 0 && (
              <span className="tabular-nums text-warning">이상 {issueCount}</span>
            )}
            {damageCount > 0 && (
              <span className="tabular-nums text-danger">파손 {damageCount}</span>
            )}
            <span className="text-muted-foreground/70">
              {saveState === "saving"
                ? "저장 중…"
                : lastSavedAt
                  ? `${lastSavedAt} 저장됨`
                  : "자동 저장"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleSave}
            >
              임시 저장
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={handleFinalize}
              className="gap-1.5"
            >
              <Check className="size-4" /> 완료
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
