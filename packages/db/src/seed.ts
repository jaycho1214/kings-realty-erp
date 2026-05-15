import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import type { DB } from "./types";

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: url }),
    }),
  });

  const auth = betterAuth({
    database: kyselyAdapter(db, { type: "postgres" }),
    emailAndPassword: { enabled: true },
    advanced: {
      database: {
        generateId: "serial",
      },
    },
    plugins: [admin({ defaultRole: "staff" })],
  });

  // Create admin account
  const result = await auth.api.signUpEmail({
    body: {
      name: "Admin",
      email: "admin@kingsrealty.kr",
      password: "admin1234",
    },
  });

  if (!result?.user?.id) {
    console.error("Failed to create admin user");
    process.exit(1);
  }

  // Set role to admin
  await db
    .updateTable("user")
    .set({ role: "admin" })
    .where("id", "=", Number(result.user.id))
    .execute();

  console.log("Admin account created:");
  console.log("  Email: admin@kingsrealty.kr");
  console.log("  Password: admin1234");
  console.log("  Role: admin");

  await db.destroy();
}

main();
