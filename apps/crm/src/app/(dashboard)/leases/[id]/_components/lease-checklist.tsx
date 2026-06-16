import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

interface ChecklistItem {
  label: string;
  description: string;
  checked: boolean;
  href?: string;
}

interface ChecklistProps {
  items: ChecklistItem[];
  title: string;
}

export function LeaseChecklist({ items, title }: ChecklistProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="divide-y rounded-lg border">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-3 px-4 py-3 ${
              item.checked ? "opacity-60" : ""
            }`}
          >
            {item.checked ? (
              <CheckCircle2 className="size-5 shrink-0 text-success" />
            ) : (
              <Circle className="size-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  item.checked ? "text-muted-foreground line-through" : ""
                }`}
              >
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
            </div>
            {!item.checked && item.href && (
              <Link
                href={item.href}
                className="shrink-0 rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted"
              >
                처리하기
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
