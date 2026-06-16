"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revealLandlordRrn } from "../../_actions";

// Inlined (NOT imported from @/lib/rrn — that module pulls in node:crypto and
// must never be bundled into a client component).
const RRN_MASK = "●●●●●●-●●●●●●●";

export function LandlordRrn({
  landlordId,
  hasRrn,
}: {
  landlordId: number;
  hasRrn: boolean;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!hasRrn) return <span className="text-muted-foreground">-</span>;

  function handleReveal() {
    setError(null);
    startTransition(async () => {
      const res = await revealLandlordRrn(landlordId);
      if ("rrn" in res) setRevealed(res.rrn);
      else setError(res.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{revealed ?? RRN_MASK}</span>
      {revealed ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setRevealed(null)}
          aria-label="주민등록번호 가리기"
        >
          <EyeOff className="size-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleReveal}
          disabled={pending}
          aria-label="주민등록번호 보기"
        >
          <Eye className="size-4" />
        </Button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
