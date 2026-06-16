import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <div className="text-center">
        <h2 className="tabular text-3xl font-semibold tracking-tight">404</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          요청하신 페이지를 찾을 수 없습니다.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
