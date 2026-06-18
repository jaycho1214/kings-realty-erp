import { cache } from "react";
import { getDb } from "@kingsrealty/db";
import {
  asVariant,
  type CatalogMap,
  type ChargeType,
  type ChargeTypeCatalog,
} from "./charge-types";

/**
 * The single read of the bill_preset type catalog — the source of truth for
 * payment/charge type labels, colors, and filter chips. React-cached per request
 * so multiple server components on one request share one query.
 */
export const getChargeTypeCatalog = cache(
  async (): Promise<ChargeTypeCatalog> => {
    const rows = await getDb()
      .selectFrom("bill_preset")
      .select(["type", "label", "variant", "sort_order", "is_builtin"])
      .orderBy("sort_order", "asc")
      .execute();
    const list: ChargeType[] = rows.map((r) => ({
      type: r.type,
      label: r.label,
      variant: asVariant(r.variant),
      sort_order: Number(r.sort_order),
      is_builtin: Boolean(r.is_builtin),
    }));
    const map: CatalogMap = {};
    for (const c of list) map[c.type] = { label: c.label, variant: c.variant };
    return { list, map };
  },
);
