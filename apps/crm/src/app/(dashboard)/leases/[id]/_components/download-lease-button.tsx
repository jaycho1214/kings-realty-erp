"use client";

import { Download } from "lucide-react";

export function DownloadLeaseButton({ leaseId }: { leaseId: number }) {
  return (
    <a
      href={`/api/leases/${leaseId}/pdf`}
      download
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
    >
      <Download className="size-3.5" />
      계약서 PDF
    </a>
  );
}
