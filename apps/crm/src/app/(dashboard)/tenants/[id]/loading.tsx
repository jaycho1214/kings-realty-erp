import { Skeleton } from "@/components/ui/skeleton";

/** Fallback while a tenant detail loads (also fires on id→id navigation). */
export default function TenantDetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}
