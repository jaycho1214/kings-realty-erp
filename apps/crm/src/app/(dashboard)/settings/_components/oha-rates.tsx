import { OhaRateTable } from "@/components/oha-rate-table";

interface OhaRatesProps {
  rows: Record<string, { with: string; without: string }>;
  editable: boolean;
}

export function OhaRates({ rows, editable }: OhaRatesProps) {
  return (
    <div className="space-y-3 p-3">
      <p className="px-1 text-xs text-muted-foreground">
        실제 OHA Rates 시트 기준입니다(KRW). 금액을 수정하고 저장하세요. 세입자
        상세의 계급 배지에서도 동일한 표를 편집할 수 있습니다.
      </p>
      <OhaRateTable rows={rows} editable={editable} />
    </div>
  );
}
