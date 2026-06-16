import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runDailyJobs } from "@/lib/cron/daily";

export const dynamic = "force-dynamic";

/**
 * Daily maintenance cron. Invoked by Vercel Cron (see vercel.json) which sends
 * `Authorization: Bearer ${CRON_SECRET}`. Reject anything without the secret.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyJobs();
    // ok reflects per-job success: an isolated job failure surfaces here
    // (HTTP 200) instead of aborting the whole run.
    return NextResponse.json({ ok: result.errors.length === 0, ...result });
  } catch (err) {
    console.error("[cron/daily] failed", err);
    return NextResponse.json(
      { ok: false, error: "job failed" },
      { status: 500 },
    );
  }
}
