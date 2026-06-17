export type EventCategory =
  | "lease_start"
  | "lease_end"
  | "rent_due"
  | "utility_due"
  | "service_request"
  | "inspection"
  | "custom";

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  endDate?: Date;
  category: EventCategory;
  entityId: string | number;
  entityPath: string;
  description?: string;
  tenantId?: string | number;
  tenantName?: string;
  staffId?: number;
  staffName?: string;
}

export const categoryConfig: Record<
  EventCategory,
  { label: string; dotColor: string; bgColor: string; textColor: string }
> = {
  lease_start: {
    label: "계약 시작",
    dotColor: "bg-primary",
    bgColor: "bg-primary/10",
    textColor: "text-primary",
  },
  lease_end: {
    label: "계약 종료",
    dotColor: "bg-red-500",
    bgColor: "bg-red-50 dark:bg-red-500/10",
    textColor: "text-red-600 dark:text-red-400",
  },
  rent_due: {
    label: "월세 납부",
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-500/10",
    textColor: "text-amber-600 dark:text-amber-400",
  },
  utility_due: {
    label: "공과금 납기",
    dotColor: "bg-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-500/10",
    textColor: "text-blue-600 dark:text-blue-400",
  },
  service_request: {
    label: "AS 요청",
    dotColor: "bg-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-500/10",
    textColor: "text-orange-600 dark:text-orange-400",
  },
  inspection: {
    label: "입주/퇴거 점검",
    dotColor: "bg-teal-500",
    bgColor: "bg-teal-50 dark:bg-teal-500/10",
    textColor: "text-teal-600 dark:text-teal-400",
  },
  custom: {
    label: "일정",
    dotColor: "bg-violet-500",
    bgColor: "bg-violet-50 dark:bg-violet-500/10",
    textColor: "text-violet-600 dark:text-violet-400",
  },
};
