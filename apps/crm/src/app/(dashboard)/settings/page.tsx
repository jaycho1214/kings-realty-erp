import { ThemeToggle } from "./_components/theme-toggle";
import { LowPcToggle } from "./_components/low-pc-toggle";

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

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">저사양 모드</h2>
          <p className="text-sm text-muted-foreground">
            화면 전환 효과와 흐림 효과를 끕니다. 컴퓨터가 느리거나 창이 버벅일
            때 켜세요. 자동은 Windows의 &ldquo;애니메이션 효과&rdquo; 설정을
            따릅니다. 이 설정은 지금 사용 중인 컴퓨터에만 적용됩니다.
          </p>
        </div>
        <LowPcToggle />
      </section>
    </div>
  );
}
