import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types";

const { Pool } = pg;

export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 5000,
  });

  // Attach pool for Vercel Fluid Compute cleanup on suspension
  if (typeof globalThis !== "undefined") {
    try {
      // Dynamic import to avoid errors in non-Vercel environments (migrations, seeds)
      import("@vercel/functions")
        .then(({ attachDatabasePool }) => {
          attachDatabasePool(pool);
        })
        .catch(() => {
          // Not running on Vercel — skip
        });
    } catch {
      // Not running on Vercel — skip
    }
  }

  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
  });
}

let _db: Kysely<DB> | null = null;

export function getDb(): Kysely<DB> {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _db = createDb(url);
  }
  return _db;
}

export { sql } from "kysely";
export type { Transaction } from "kysely";
export type { DB } from "./types";
export * from "./types";
