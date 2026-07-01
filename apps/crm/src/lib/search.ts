import { escapeLike } from "./utils";

/**
 * Turn a free-text name query into a list of ILIKE patterns, one per whitespace
 * token, for AND-matching. Word order stops mattering and partial tokens work:
 * "smith john" and "joh smi" both match "John Smith". Each token is
 * `escapeLike`-escaped so wildcard characters match literally.
 *
 * Returns `[]` when the query has no tokens (empty / whitespace only) — callers
 * should treat that as "no search".
 */
export function nameSearchPatterns(query: string): string[] {
  return query
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => `%${escapeLike(token)}%`);
}
