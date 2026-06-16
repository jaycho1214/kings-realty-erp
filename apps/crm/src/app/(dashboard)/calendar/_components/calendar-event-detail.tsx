"use client";

import Link from "next/link";
import { useTransition } from "react";
import {
  FileText,
  CreditCard,
  Zap,
  Wrench,
  CalendarHeart,
  ArrowRight,
  X,
  CalendarPlus,
  Download,
  Trash2,
  Users,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryConfig, type EventCategory } from "@/lib/calendar-config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { deleteCalendarEvent } from "../_actions";

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

interface CalendarEventDetailProps {
  day: number;
  month: number;
  year: number;
  events: SerializedEvent[];
  onClose: () => void;
}

const categoryIcon: Record<EventCategory, typeof FileText> = {
  lease_start: FileText,
  lease_end: FileText,
  rent_due: CreditCard,
  utility_due: Zap,
  service_request: Wrench,
  custom: CalendarHeart,
};

function getGoogleCalendarUrl(event: SerializedEvent) {
  // event.date is a UTC-midnight ISO string of the Korea calendar day; read it
  // in UTC so the exported all-day event lands on the right day in any browser.
  const date = new Date(event.date);
  const startStr = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const endStr = `${nextDay.getUTCFullYear()}${String(nextDay.getUTCMonth() + 1).padStart(2, "0")}${String(nextDay.getUTCDate()).padStart(2, "0")}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${startStr}/${endStr}`,
    details: event.description ?? "",
  });
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}

export function CalendarEventDetail({
  day,
  month,
  year,
  events,
  onClose,
}: CalendarEventDetailProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(entityId: string | number) {
    startTransition(() => deleteCalendarEvent(Number(entityId)));
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_16px_rgba(0,0,0,0.03)] dark:border-border dark:shadow-none">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {year}년 {month}월 {day}일
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {events.length}건
          </span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-2">
        {events.map((event) => {
          const config = categoryConfig[event.category];
          const Icon = categoryIcon[event.category];
          return (
            <div
              key={event.id}
              className="flex items-start gap-3 rounded-xl border p-3"
            >
              <div
                className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                  config.bgColor,
                )}
              >
                <Icon className={cn("size-4", config.textColor)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{event.title}</p>
                {event.description && (
                  <p className="truncate text-xs text-muted-foreground">
                    {event.description}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  <span
                    className={cn("text-[10px] font-medium", config.textColor)}
                  >
                    {config.label}
                  </span>
                  {event.tenantName && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Users className="size-2.5" />
                      {event.tenantName}
                    </span>
                  )}
                  {event.staffName && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <User className="size-2.5" />
                      {event.staffName}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* Add to Calendar dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground"
                      />
                    }
                  >
                    <CalendarPlus className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        window.open(getGoogleCalendarUrl(event), "_blank")
                      }
                    >
                      <CalendarPlus className="size-3.5" />
                      Google Calendar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        window.open(
                          `/api/calendar/event.ics?id=${event.entityId}&category=${event.category}`,
                          "_blank",
                        )
                      }
                    >
                      <Download className="size-3.5" />
                      .ics 다운로드
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Delete for custom events, link for others */}
                {event.category === "custom" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-danger/70 hover:text-danger"
                    disabled={isPending}
                    onClick={() => handleDelete(event.entityId)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : (
                  <Link href={event.entityPath}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                    >
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
