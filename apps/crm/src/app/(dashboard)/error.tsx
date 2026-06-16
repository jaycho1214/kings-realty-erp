"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold">오류가 발생했습니다</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error.message || "페이지를 불러오는 중 문제가 발생했습니다."}
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        다시 시도
      </button>
    </div>
  );
}
