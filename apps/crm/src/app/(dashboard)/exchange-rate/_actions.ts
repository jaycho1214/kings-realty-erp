"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";

const DENOMINATIONS = [100, 50, 20, 10, 5, 1] as const;

export async function setExchangeRate(formData: FormData) {
  const session = await requireAdmin();

  const db = getDb();

  const date = formData.get("date") as string;

  if (!date) {
    throw new Error("날짜를 입력해주세요.");
  }

  const entries: { denomination: number; rate: number }[] = [];

  for (const denom of DENOMINATIONS) {
    const raw = formData.get(`rate_${denom}`) as string;
    if (raw && raw.trim() !== "") {
      const rate = Number(raw);
      if (isNaN(rate) || rate <= 0) {
        throw new Error(`$${denom} 환율이 올바르지 않습니다.`);
      }
      entries.push({ denomination: denom, rate });
    }
  }

  if (entries.length === 0) {
    throw new Error("최소 하나의 환율을 입력해주세요.");
  }

  for (const entry of entries) {
    await db
      .insertInto("exchange_rate")
      .values({
        date,
        denomination: entry.denomination,
        usd_to_krw: entry.rate,
        set_by: Number(session.user.id),
      })
      .onConflict((oc) =>
        oc.columns(["date", "denomination"]).doUpdateSet({
          usd_to_krw: entry.rate,
          set_by: Number(session.user.id),
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  revalidatePath("/exchange-rate");
  revalidatePath("/");
}
