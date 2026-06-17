"use client";

import { useMemo, useState } from "react";
import { CalendarDays, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { seoulYMD } from "@/lib/date";
import { categoryConfig, type EventCategory } from "@/lib/calendar-config";
import { CalendarEventDetail } from "./calendar-event-detail";
import { CreateEventDialog } from "./create-event-dialog";

interface SerializedEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  category: EventCategory;
  entityId: string | number;
  entityPath: string;
  description?: string;
  tenantId?: string | number;
  tenantName?: string;
  staffId?: number;
  staffName?: string;
}

interface FormData {
  staff: { id: number; name: string }[];
  tenants: { id: number; name: string }[];
  landlords: { id: number; name: string }[];
  properties: { id: number; address: string }[];
  categories: { id: number; value: string; label: string; icon: string }[];
}

interface CalendarGridProps {
  year: number;
  month: number;
  events: SerializedEvent[];
  staff: { id: number; name: string }[];
  formData: FormData;
}

const DAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

export function CalendarGrid({
  year,
  month,
  events,
  staff,
  formData,
}: CalendarGridProps) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>();
  const [activeFilters, setActiveFilters] = useState<Set<EventCategory>>(
    new Set(),
  );
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  // "Today" is the Asia/Seoul business day, not the viewer's local day — a
  // CONUS-based admin must still see the Korea date highlighted.
  const seoulToday = seoulYMD();
  const isCurrentMonth = seoulToday.year === year && seoulToday.month === month;
  const todayDate = seoulToday.day;

  function toggleFilter(category: EventCategory) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  // Only show staff that actually appear in this month's events
  const relevantStaff = useMemo(() => {
    const ids = new Set(events.filter((e) => e.staffId).map((e) => e.staffId!));
    return staff.filter((s) => ids.has(s.id));
  }, [events, staff]);

  const hasAnyFilter = activeFilters.size > 0 || selectedStaffId;

  // Filter events
  const filteredEvents = events.filter((e) => {
    if (activeFilters.size > 0 && !activeFilters.has(e.category)) return false;
    if (selectedStaffId && e.staffId !== selectedStaffId) return false;
    return true;
  });

  // Group events by day
  const eventsByDay: Record<number, SerializedEvent[]> = {};
  for (const event of filteredEvents) {
    // event.date is a UTC-midnight ISO string of the Korea calendar day;
    // read it in UTC so the day doesn't shift in non-Seoul browsers.
    const d = new Date(event.date);
    const day = d.getUTCDate();
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(event);
  }

  // Previous month trailing days
  const prevMonthDays = getDaysInMonth(
    month === 1 ? year - 1 : year,
    month === 1 ? 12 : month - 1,
  );

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];
  const hasSelection = selectedDay !== null && selectedEvents.length > 0;

  // Count events per category for badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.category] = (counts[e.category] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  function resetFilters() {
    setActiveFilters(new Set());
    setSelectedStaffId(null);
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="space-y-3">
        {/* Category filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(categoryConfig).map(([key, config]) => {
            const category = key as EventCategory;
            const isActive = activeFilters.has(category);
            const count = categoryCounts[category] ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleFilter(category)}
                className={cn(
                  "group flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all",
                  isActive
                    ? "border-foreground/15 bg-foreground/5 font-medium text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <div
                  className={cn(
                    "size-2 rounded-full transition-all",
                    config.dotColor,
                    !isActive && activeFilters.size > 0 && "opacity-30",
                  )}
                />
                {config.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "tabular-nums transition-colors",
                      isActive
                        ? "text-foreground/60"
                        : "text-muted-foreground/50",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Staff filters */}
        {relevantStaff.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground/60">
              <User className="size-3" />
              담당자
            </span>
            {relevantStaff.map((s) => {
              const isActive = selectedStaffId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStaffId(isActive ? null : s.id)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs transition-all",
                    isActive
                      ? "border-foreground/15 bg-foreground/5 font-medium text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {s.name}
                </button>
              );
            })}

            {/* Reset */}
            {hasAnyFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
                초기화
              </button>
            )}
          </div>
        )}
      </div>

      {/* Calendar + day detail. On wide screens the detail becomes a sticky
          right sidebar; below xl it stacks underneath the calendar. */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* Calendar card */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {DAY_HEADERS.map((day, i) => (
              <div
                key={day}
                className={cn(
                  "py-2.5 text-center text-[11px] font-semibold tracking-wider text-muted-foreground",
                  i === 0 && "text-danger",
                  i === 6 && "text-brand",
                )}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {/* Previous month trailing days */}
            {Array.from({ length: firstDay }, (_, i) => {
              const day = prevMonthDays - firstDay + 1 + i;
              return (
                <div
                  key={`prev-${i}`}
                  className="min-h-[60px] border-b border-r bg-muted/10 p-1 sm:min-h-[104px] sm:p-2 [&:nth-child(7n)]:border-r-0"
                >
                  <span className="text-xs text-muted-foreground/30">
                    {day}
                  </span>
                </div>
              );
            })}

            {/* Current month days */}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayOfWeek = (firstDay + i) % 7;
              const dayEvents = eventsByDay[day] ?? [];
              const isToday = isCurrentMonth && day === todayDate;
              const isSelected = selectedDay === day;
              const hasEvents = dayEvents.length > 0;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    if (hasEvents) {
                      setSelectedDay(isSelected ? null : day);
                    } else {
                      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      setCreateDate(dateStr);
                      setCreateOpen(true);
                    }
                  }}
                  className={cn(
                    "flex min-h-[60px] min-w-0 flex-col items-start overflow-hidden border-b border-r p-1 text-left transition-colors sm:min-h-[104px] sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                    "cursor-pointer hover:bg-accent/50",
                    isSelected && "bg-accent/60",
                    dayOfWeek === 0 && "bg-danger-weak/40",
                    dayOfWeek === 6 && "bg-brand-weak/40",
                  )}
                >
                  <span
                    className={cn(
                      "mb-0.5 inline-flex size-6 items-center justify-center rounded-full text-xs",
                      dayOfWeek === 0 && "text-danger",
                      dayOfWeek === 6 && "text-brand",
                      isToday
                        ? "bg-primary font-bold text-primary-foreground"
                        : "font-medium",
                    )}
                  >
                    {day}
                  </span>

                  {/* Event pills */}
                  {dayEvents.length > 0 && (
                    <div className="flex w-full flex-col gap-px">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div
                          key={event.id}
                          className={cn(
                            "flex min-w-0 items-center gap-1 rounded-[4px] px-1 py-[2px]",
                            categoryConfig[event.category].bgColor,
                          )}
                        >
                          <div
                            className={cn(
                              "size-1 shrink-0 rounded-full",
                              categoryConfig[event.category].dotColor,
                            )}
                          />
                          <span
                            className={cn(
                              "truncate text-[10px] leading-tight font-medium",
                              categoryConfig[event.category].textColor,
                            )}
                          >
                            {event.title}
                          </span>
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="px-1 text-[10px] leading-tight text-muted-foreground">
                          +{dayEvents.length - 2}건
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Next month leading days */}
            {(() => {
              const totalCells = firstDay + daysInMonth;
              const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
              return Array.from({ length: remaining }, (_, i) => (
                <div
                  key={`next-${i}`}
                  className="min-h-[60px] border-b border-r bg-muted/10 p-1 sm:min-h-[104px] sm:p-2 [&:nth-child(7n)]:border-r-0"
                >
                  <span className="text-xs text-muted-foreground/30">
                    {i + 1}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Day detail — persistent right sidebar at xl; below xl it only
            appears (stacked) when a day with events is selected. */}
        <div
          className={cn(
            "xl:sticky xl:top-[4.5rem] xl:w-80 xl:shrink-0",
            !hasSelection && "hidden xl:block",
          )}
        >
          {selectedDay !== null && selectedEvents.length > 0 ? (
            <CalendarEventDetail
              day={selectedDay}
              month={month}
              year={year}
              events={selectedEvents}
              onClose={() => setSelectedDay(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/40 px-6 py-14 text-center">
              <CalendarDays className="size-7 text-muted-foreground/40" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                날짜를 선택하면
                <br />
                일정이 표시됩니다
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create event dialog from day click */}
      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={createDate}
        {...formData}
      />
    </div>
  );
}
