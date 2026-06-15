import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Kysely, PostgresDialect } from "kysely";
// Migration helpers moved to the `kysely/migration` subpath export.
import { Migrator, FileMigrationProvider } from "kysely/migration";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: url }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });

  const command = process.argv[2];

  if (command === "down") {
    const { error, results } = await migrator.migrateDown();
    results?.forEach((r) => {
      console.log(`↓ ${r.migrationName}: ${r.status}`);
    });
    if (error) {
      console.error("Migration down failed:", error);
      process.exit(1);
    }
  } else {
    const { error, results } = await migrator.migrateToLatest();
    results?.forEach((r) => {
      console.log(`↑ ${r.migrationName}: ${r.status}`);
    });
    if (error) {
      console.error("Migration failed:", error);
      process.exit(1);
    }
  }

  console.log("Done.");
  await db.destroy();
}

main();
