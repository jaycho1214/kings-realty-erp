export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export interface CatalogEntry {
  label: string;
  variant: BadgeVariant;
}

export type CatalogMap = Record<string, CatalogEntry>;

export interface ChargeType {
  type: string;
  label: string;
  variant: BadgeVariant;
  sort_order: number;
  is_builtin: boolean;
}

export interface ChargeTypeCatalog {
  list: ChargeType[];
  map: CatalogMap;
}

const VARIANTS: BadgeVariant[] = [
  "default",
  "secondary",
  "destructive",
  "outline",
];

/** Coerce a stored variant string to a valid Badge variant (default outline). */
export function asVariant(v: string | null | undefined): BadgeVariant {
  return v && (VARIANTS as string[]).includes(v)
    ? (v as BadgeVariant)
    : "outline";
}

/**
 * Resolve a stored type key to its display label + badge color. Falls back to the
 * raw key — never a hardcoded label map, so any DB-added type renders correctly.
 */
export function resolveChargeType(map: CatalogMap, type: string): CatalogEntry {
  return map[type] ?? { label: type, variant: "outline" };
}
