"use client";

import { createContext, useContext } from "react";
import {
  resolveChargeType,
  type CatalogEntry,
  type CatalogMap,
} from "@/lib/charge-types";

const ChargeTypeContext = createContext<CatalogMap>({});

/** Supplies the DB type catalog (from the dashboard layout) to client components. */
export function ChargeTypeProvider({
  value,
  children,
}: {
  value: CatalogMap;
  children: React.ReactNode;
}) {
  return (
    <ChargeTypeContext.Provider value={value}>
      {children}
    </ChargeTypeContext.Provider>
  );
}

/** Client-side access to the type catalog: `resolve(type)` → label + badge color. */
export function useChargeTypes(): {
  map: CatalogMap;
  resolve: (type: string) => CatalogEntry;
} {
  const map = useContext(ChargeTypeContext);
  return { map, resolve: (type: string) => resolveChargeType(map, type) };
}
