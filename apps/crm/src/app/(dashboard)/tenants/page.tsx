import { Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

/**
 * /tenants index — the right pane when no tenant is selected. On mobile the
 * workspace shell hides this and shows the roster rail full-width instead.
 */
export default function TenantsIndexPage() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center rounded-xl border border-dashed border-border/70">
      <EmptyState
        icon={Users}
        title="세입자를 선택하세요"
        description="왼쪽 목록에서 세입자를 클릭하거나 이름·전화번호로 검색해 보세요."
      />
    </div>
  );
}
