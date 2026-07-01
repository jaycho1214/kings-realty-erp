"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// Fixed-width mask — independent of the real length so it doesn't leak how many
// digits the code has.
const MASK = "●●●●●";

export function SecretValue({
  value,
  label,
}: {
  value: string | null;
  label: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const trimmed = value?.trim();
  if (!trimmed) return <span className="text-muted-foreground">-</span>;

  function handleCopy() {
    void navigator.clipboard.writeText(trimmed as string).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{revealed ? trimmed : MASK}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setRevealed((r) => !r)}
        aria-label={`${label} ${revealed ? "가리기" : "보기"}`}
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        aria-label={`${label} 복사`}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </span>
  );
}
