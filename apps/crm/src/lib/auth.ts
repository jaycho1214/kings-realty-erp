import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { getDb } from "@kingsrealty/db";
import {
  ac,
  adminRole,
  staffRole,
  accountingRole,
  pendingRole,
} from "./permissions";

export const auth = betterAuth({
  database: kyselyAdapter(getDb(), { type: "postgres" }),
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    database: {
      generateId: "serial",
    },
  },
  plugins: [
    admin({
      defaultRole: "pending",
      ac,
      roles: {
        admin: adminRole,
        staff: staffRole,
        accounting: accountingRole,
        pending: pendingRole,
      },
    }),
  ],
});
