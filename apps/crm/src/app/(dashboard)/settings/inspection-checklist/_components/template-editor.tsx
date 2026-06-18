"use client";

import { useRef, useState } from "react";
import { Plus, Pencil, Trash2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataPanel } from "@/components/data-panel";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import {
  addSection,
  updateSection,
  deleteSection,
  addItem,
  updateItem,
  deleteItem,
} from "../_actions";

interface ItemRow {
  id: number;
  section_id: number;
  subgroup_ko: string | null;
  subgroup_en: string | null;
  label_ko: string;
  label_en: string | null;
  sort_order: number;
}
interface SectionRow {
  id: number;
  key: string;
  label_ko: string;
  label_en: string | null;
  repeatable: boolean;
  sort_order: number;
  items: ItemRow[];
}

export function TemplateEditor({ sections }: { sections: SectionRow[] }) {
  const addSectionRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}

      <DataPanel>
        <form
          ref={addSectionRef}
          action={async (fd) => {
            await addSection(fd);
            addSectionRef.current?.reset();
          }}
          className="flex flex-wrap items-end gap-2 p-3"
        >
          <div className="space-y-1">
            <Label htmlFor="new-sec-ko">새 섹션 (한글)</Label>
            <Input
              id="new-sec-ko"
              name="label_ko"
              required
              className="w-40"
              placeholder="예: 베란다"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-sec-en">영문</Label>
            <Input
              id="new-sec-en"
              name="label_en"
              className="w-40"
              placeholder="BALCONY"
            />
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-sm">
            <input type="checkbox" name="repeatable" /> 반복(방/화장실)
          </label>
          <SubmitButton label="섹션 추가" />
        </form>
      </DataPanel>
    </div>
  );
}

function SectionCard({ section }: { section: SectionRow }) {
  const [editing, setEditing] = useState(false);
  const addItemRef = useRef<HTMLFormElement>(null);
  const deleteSectionAction = deleteSection.bind(null, section.id);

  return (
    <DataPanel>
      <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
        {editing ? (
          <form
            action={async (fd) => {
              await updateSection(section.id, fd);
              setEditing(false);
            }}
            className="flex flex-1 flex-wrap items-end gap-2"
          >
            <Input
              name="label_ko"
              required
              defaultValue={section.label_ko}
              className="w-36"
            />
            <Input
              name="label_en"
              defaultValue={section.label_en ?? ""}
              className="w-36"
              placeholder="영문"
            />
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="repeatable"
                defaultChecked={section.repeatable}
              />{" "}
              반복
            </label>
            <SubmitButton label="저장" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
            >
              취소
            </Button>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{section.label_ko}</span>
              {section.label_en && (
                <span className="text-xs text-muted-foreground">
                  {section.label_en}
                </span>
              )}
              {section.repeatable && (
                <Badge variant="secondary" className="gap-1">
                  <Repeat className="size-3" /> 반복
                </Badge>
              )}
            </div>
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="섹션 수정"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" />
              </Button>
              <ConfirmActionButton
                action={deleteSectionAction}
                label=""
                ariaLabel="섹션 삭제"
                icon={<Trash2 className="size-4" />}
                variant="ghost"
                size="icon-sm"
                className="hover:text-danger"
                confirmWord="삭제"
                confirmLabel="삭제"
                title="섹션을 삭제하시겠습니까?"
                description="이 섹션과 모든 항목이 삭제됩니다. 기존 점검 기록에는 영향을 주지 않습니다."
                pendingLabel="삭제 중..."
              />
            </div>
          </>
        )}
      </div>

      <ul className="divide-y divide-border/40">
        {section.items.map((item) => (
          <ItemRowView key={item.id} item={item} />
        ))}
      </ul>

      <form
        ref={addItemRef}
        action={async (fd) => {
          await addItem(section.id, fd);
          addItemRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2 border-t border-border/60 p-2.5"
      >
        <Input name="subgroup_ko" className="w-28" placeholder="그룹(선택)" />
        <Input name="label_ko" required className="w-40" placeholder="항목 (한글)" />
        <Input name="label_en" className="w-40" placeholder="EN (선택)" />
        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <Plus className="size-3.5" /> 항목
        </Button>
      </form>
    </DataPanel>
  );
}

function ItemRowView({ item }: { item: ItemRow }) {
  const [editing, setEditing] = useState(false);
  const deleteAction = deleteItem.bind(null, item.id);

  if (editing) {
    return (
      <li className="p-2.5">
        <form
          action={async (fd) => {
            await updateItem(item.id, fd);
            setEditing(false);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <Input
            name="subgroup_ko"
            defaultValue={item.subgroup_ko ?? ""}
            className="w-28"
            placeholder="그룹"
          />
          <Input
            name="subgroup_en"
            defaultValue={item.subgroup_en ?? ""}
            className="w-28"
            placeholder="GROUP"
          />
          <Input
            name="label_ko"
            required
            defaultValue={item.label_ko}
            className="w-40"
          />
          <Input
            name="label_en"
            defaultValue={item.label_en ?? ""}
            className="w-40"
            placeholder="EN"
          />
          <SubmitButton label="저장" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
          >
            취소
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="group flex items-center justify-between px-3.5 py-2 text-sm">
      <span className="flex items-center gap-2">
        {item.subgroup_ko && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {item.subgroup_ko}
          </span>
        )}
        <span>{item.label_ko}</span>
        {item.label_en && (
          <span className="text-xs text-muted-foreground">{item.label_en}</span>
        )}
      </span>
      <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="항목 수정"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <ConfirmActionButton
          action={deleteAction}
          label=""
          ariaLabel="항목 삭제"
          icon={<Trash2 className="size-3.5" />}
          variant="ghost"
          size="icon-sm"
          className="hover:text-danger"
          confirmWord="삭제"
          confirmLabel="삭제"
          title="항목을 삭제하시겠습니까?"
          description="이 항목이 템플릿에서 삭제됩니다. 기존 점검 기록에는 영향을 주지 않습니다."
          pendingLabel="삭제 중..."
        />
      </span>
    </li>
  );
}
