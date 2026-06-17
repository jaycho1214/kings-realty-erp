"use client";

import { useRef, useCallback, useState } from "react";
import { Check, ChevronsUpDown, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";
import { createCalendarEvent } from "../_actions";

const EVENT_COLORS = [
  { value: "primary", label: "파란색", class: "bg-primary" },
  { value: "red", label: "빨간색", class: "bg-red-500" },
  { value: "amber", label: "노란색", class: "bg-amber-500" },
  { value: "green", label: "초록색", class: "bg-green-500" },
  { value: "violet", label: "보라색", class: "bg-violet-500" },
  { value: "orange", label: "주황색", class: "bg-orange-500" },
  { value: "pink", label: "분홍색", class: "bg-pink-500" },
  { value: "teal", label: "청록색", class: "bg-teal-500" },
];

const URGENCY_OPTIONS = [
  { value: "low", label: "낮음", class: "text-muted-foreground" },
  { value: "normal", label: "보통", class: "text-foreground" },
  { value: "high", label: "높음", class: "text-warning" },
  { value: "urgent", label: "긴급", class: "text-danger" },
];

interface Attendee {
  type: "staff" | "tenant" | "landlord";
  id: string;
  name: string;
}

interface EventCategory {
  id: number;
  value: string;
  label: string;
  icon: string;
}

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  staff: { id: number; name: string }[];
  tenants: { id: number; name: string }[];
  landlords: { id: number; name: string }[];
  properties: { id: number; address: string }[];
  categories: EventCategory[];
}

export function CreateEventDialog({
  open,
  onOpenChange,
  defaultDate,
  staff,
  tenants,
  landlords,
  properties,
  categories,
}: CreateEventDialogProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isAllDay, setIsAllDay] = useState(true);
  const [selectedColor, setSelectedColor] = useState("primary");
  const [selectedAttendees, setSelectedAttendees] = useState<Attendee[]>([]);
  const [attendeePopoverOpen, setAttendeePopoverOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("general");
  const [propertyPopoverOpen, setPropertyPopoverOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [error, setError] = useState("");

  const handleAction = useCallback(
    async (formData: FormData) => {
      formData.set("color", selectedColor);
      formData.set("is_all_day", isAllDay ? "true" : "false");
      formData.set(
        "attendees",
        JSON.stringify(
          selectedAttendees.map((a) => ({ type: a.type, id: a.id })),
        ),
      );
      if (selectedPropertyId) {
        formData.set("property_id", selectedPropertyId);
      }
      setError("");
      const result = await createCalendarEvent(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      formRef.current?.reset();
      setSelectedColor("primary");
      setSelectedAttendees([]);
      setIsAllDay(true);
      setSelectedCategory("general");
      setSelectedPropertyId("");
    },
    [
      onOpenChange,
      selectedColor,
      selectedAttendees,
      isAllDay,
      selectedPropertyId,
    ],
  );

  function toggleAttendee(attendee: Attendee) {
    setSelectedAttendees((prev) => {
      const exists = prev.some(
        (a) => a.type === attendee.type && a.id === attendee.id,
      );
      if (exists) {
        return prev.filter(
          (a) => !(a.type === attendee.type && a.id === attendee.id),
        );
      }
      return [...prev, attendee];
    });
  }

  function removeAttendee(attendee: Attendee) {
    setSelectedAttendees((prev) =>
      prev.filter((a) => !(a.type === attendee.type && a.id === attendee.id)),
    );
  }

  function isSelected(type: string, id: string) {
    return selectedAttendees.some((a) => a.type === type && a.id === id);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val: boolean) => {
        onOpenChange(val);
        if (!val) {
          setSelectedColor("primary");
          setSelectedAttendees([]);
          setIsAllDay(true);
          setSelectedCategory("general");
          setSelectedPropertyId("");
          setError("");
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>일정 추가</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={handleAction} className="space-y-5">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">
              제목 <span className="text-danger">*</span>
            </Label>
            <Input
              id="title"
              name="title"
              required
              placeholder="일정 제목"
              autoFocus
            />
          </div>

          {/* Category + Urgency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="category">분류</Label>
              <select
                id="category"
                name="category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.value}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
              {selectedCategory === "general" && (
                <Input
                  name="custom_category"
                  placeholder="분류명을 입력하세요"
                  autoFocus
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="urgency">긴급도</Label>
              <select
                id="urgency"
                name="urgency"
                defaultValue="normal"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {URGENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>색상</Label>
            <div className="flex items-center gap-1.5">
              {EVENT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setSelectedColor(color.value)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full transition-all",
                    selectedColor === color.value
                      ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                      : "hover:scale-110",
                  )}
                  aria-label={color.label}
                >
                  <div className={cn("size-5 rounded-full", color.class)} />
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="date">
                  시작일 <span className="text-danger">*</span>
                </Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  required
                  defaultValue={defaultDate}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">종료일</Label>
                <Input id="end_date" name="end_date" type="date" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="is_all_day"
                checked={isAllDay}
                onCheckedChange={(checked: boolean) => setIsAllDay(checked)}
              />
              <Label htmlFor="is_all_day" className="text-sm font-normal">
                종일
              </Label>
            </div>

            {!isAllDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="start_time">시작 시간</Label>
                  <Input
                    id="start_time"
                    name="start_time"
                    type="time"
                    defaultValue="09:00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_time">종료 시간</Label>
                  <Input
                    id="end_time"
                    name="end_time"
                    type="time"
                    defaultValue="10:00"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">메모</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="선택 사항"
              className="min-h-[72px]"
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">장소</Label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="location"
                name="location"
                placeholder="선택 사항"
                className="pl-8"
              />
            </div>
          </div>

          {/* Property */}
          {properties.length > 0 && (
            <div className="space-y-2">
              <Label>매물</Label>
              <Popover
                open={propertyPopoverOpen}
                onOpenChange={setPropertyPopoverOpen}
              >
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      type="button"
                      className="h-8 w-full justify-between px-2.5 font-normal"
                    />
                  }
                >
                  <span
                    className={cn(
                      !selectedPropertyId && "text-muted-foreground",
                    )}
                  >
                    {selectedPropertyId
                      ? (properties.find(
                          (p) => String(p.id) === selectedPropertyId,
                        )?.address ?? "선택 안 함")
                      : "매물 검색..."}
                  </span>
                  <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="주소 검색..." />
                    <CommandList>
                      <CommandEmpty>결과 없음</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="none"
                          onSelect={() => {
                            setSelectedPropertyId("");
                            setPropertyPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-1.5 size-3.5",
                              !selectedPropertyId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          선택 안 함
                        </CommandItem>
                        {properties.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.address}
                            onSelect={() => {
                              setSelectedPropertyId(String(p.id));
                              setPropertyPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-1.5 size-3.5",
                                selectedPropertyId === String(p.id)
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {p.address}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <input
                type="hidden"
                name="property_id"
                value={selectedPropertyId}
              />
            </div>
          )}

          {/* Attendees */}
          <div className="space-y-2">
            <Label>참석자</Label>
            <Popover
              open={attendeePopoverOpen}
              onOpenChange={setAttendeePopoverOpen}
            >
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    type="button"
                    className="h-auto min-h-8 w-full justify-between px-2.5 font-normal"
                  />
                }
              >
                {selectedAttendees.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedAttendees.map((a) => (
                      <Badge
                        key={`${a.type}-${a.id}`}
                        variant="outline"
                        className="gap-0.5 pr-1"
                      >
                        <span className="text-[10px] text-muted-foreground">
                          {a.type === "staff"
                            ? "직원"
                            : a.type === "tenant"
                              ? "세입자"
                              : "임대인"}
                        </span>
                        {a.name}
                        <button
                          type="button"
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAttendee(a);
                          }}
                        >
                          <X className="size-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">참석자 선택</span>
                )}
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="이름 검색..." />
                  <CommandList>
                    <CommandEmpty>결과 없음</CommandEmpty>
                    {staff.length > 0 && (
                      <CommandGroup heading="직원">
                        {staff.map((s) => (
                          <CommandItem
                            key={`staff-${s.id}`}
                            value={`직원 ${s.name} ${s.id}`}
                            onSelect={() =>
                              toggleAttendee({
                                type: "staff",
                                id: String(s.id),
                                name: s.name,
                              })
                            }
                          >
                            <Check
                              className={cn(
                                "mr-1.5 size-3.5",
                                isSelected("staff", String(s.id))
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {s.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {tenants.length > 0 && (
                      <CommandGroup heading="세입자">
                        {tenants.map((t) => (
                          <CommandItem
                            key={`tenant-${t.id}`}
                            value={`세입자 ${t.name} ${t.id}`}
                            onSelect={() =>
                              toggleAttendee({
                                type: "tenant",
                                id: String(t.id),
                                name: t.name,
                              })
                            }
                          >
                            <Check
                              className={cn(
                                "mr-1.5 size-3.5",
                                isSelected("tenant", String(t.id))
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {t.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {landlords.length > 0 && (
                      <CommandGroup heading="임대인">
                        {landlords.map((l) => (
                          <CommandItem
                            key={`landlord-${l.id}`}
                            value={`임대인 ${l.name} ${l.id}`}
                            onSelect={() =>
                              toggleAttendee({
                                type: "landlord",
                                id: String(l.id),
                                name: l.name,
                              })
                            }
                          >
                            <Check
                              className={cn(
                                "mr-1.5 size-3.5",
                                isSelected("landlord", String(l.id))
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {l.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <SubmitButton label="추가" />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
