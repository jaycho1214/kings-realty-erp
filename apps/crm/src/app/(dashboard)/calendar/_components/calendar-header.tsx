"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CalendarSubscribeDialog } from "./calendar-subscribe-dialog";
import { CreateEventDialog } from "./create-event-dialog";
import { seoulDateString, seoulYMD } from "@/lib/date";
import { useState } from "react";

interface FormData {
  staff: { id: number; name: string }[];
  tenants: { id: number; name: string }[];
  landlords: { id: number; name: string }[];
  properties: { id: number; address: string }[];
  categories: { id: number; value: string; label: string; icon: string }[];
}

interface CalendarHeaderProps {
  year: number;
  month: number;
  formData: FormData;
}

function getPrev(year: number, month: number) {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

function getNext(year: number, month: number) {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

const MONTHS = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];

export function CalendarHeader({ year, month, formData }: CalendarHeaderProps) {
  const router = useRouter();
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const prev = getPrev(year, month);
  const next = getNext(year, month);

  const seoulToday = seoulYMD();
  const isCurrentMonth = seoulToday.year === year && seoulToday.month === month;

  // Year range: current year +/- 5
  const currentYear = seoulToday.year;
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Link href={`/calendar?year=${prev.year}&month=${prev.month}`}>
          <Button variant="outline" size="icon" className="size-9">
            <ChevronLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-1">
          <Select
            value={String(year)}
            onValueChange={(value) =>
              value && router.push(`/calendar?year=${value}&month=${month}`)
            }
          >
            <SelectTrigger className="tabular border-0 bg-transparent text-lg font-semibold shadow-none hover:bg-muted">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}년
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(month)}
            onValueChange={(value) =>
              value && router.push(`/calendar?year=${year}&month=${value}`)
            }
          >
            <SelectTrigger className="tabular border-0 bg-transparent text-lg font-semibold shadow-none hover:bg-muted">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((label, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Link href={`/calendar?year=${next.year}&month=${next.month}`}>
          <Button variant="outline" size="icon" className="size-9">
            <ChevronRight className="size-4" />
          </Button>
        </Link>
        {!isCurrentMonth && (
          <Link href="/calendar">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
            >
              오늘
            </Button>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setSubscribeOpen(true)}
        >
          <Rss className="size-3.5" />
          구독
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-3.5" />
          일정 추가
        </Button>
      </div>

      <CalendarSubscribeDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
      />
      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={
          isCurrentMonth
            ? seoulDateString()
            : `${year}-${String(month).padStart(2, "0")}-01`
        }
        {...formData}
      />
    </div>
  );
}
