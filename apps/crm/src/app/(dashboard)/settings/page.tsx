import { ThemeToggle } from "./_components/theme-toggle";

export default function SettingsGeneralPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">테마</h2>
          <p className="text-sm text-muted-foreground">
            앱의 외관을 설정합니다.
          </p>
        </div>
        <ThemeToggle />
      </section>
    </div>
  );
}
