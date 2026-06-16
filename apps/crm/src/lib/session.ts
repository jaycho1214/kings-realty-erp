import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "./auth";

/**
 * Per-request cached session getter.
 * Multiple calls within the same request only hit the auth layer once.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});
