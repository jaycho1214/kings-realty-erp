import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-[2fr_2fr_1.2fr]">
        <Skeleton className="h-[200px] rounded-xl" />
        <Skeleton className="h-[200px] rounded-xl" />
        <Skeleton className="h-[200px] rounded-xl" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
        <Skeleton className="h-[160px] rounded-xl" />
        <Skeleton className="h-[160px] rounded-xl" />
        <Skeleton className="h-[160px] rounded-xl" />
      </div>
      <Skeleton className="h-[80px] rounded-xl" />
      <div className="grid gap-5 md:grid-cols-[3fr_2fr]">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}
