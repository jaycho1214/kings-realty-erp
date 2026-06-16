import { cn } from "@/lib/utils";

type StatusType =
  | "paid"
  | "pending"
  | "overdue"
  | "active"
  | "inactive"
  | "expired"
  | "terminated"
  | "vacant"
  | "occupied"
  | "maintenance"
  | "received"
  | "in_progress"
  | "escalated"
  | "completed"
  | "cancelled";

// Semantic, theme-aware token classes (light + dark handled by the tokens themselves).
const success = "border-success/25 bg-success-weak text-success";
const info = "border-brand/25 bg-brand-weak text-brand";
const warning = "border-warning/30 bg-warning-weak text-warning";
const danger = "border-danger/30 bg-danger-weak text-danger";
const neutral = "border-border bg-secondary text-muted-foreground";

const statusStyleMap: Record<StatusType, string> = {
  paid: success,
  active: success,
  completed: success,
  vacant: success,
  occupied: info,
  in_progress: info,
  pending: warning,
  received: warning,
  maintenance: warning,
  escalated: warning,
  overdue: danger,
  terminated: danger,
  inactive: neutral,
  expired: neutral,
  cancelled: neutral,
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  const style = statusStyleMap[status as StatusType] ?? neutral;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        style,
        className,
      )}
    >
      {label}
    </span>
  );
}
