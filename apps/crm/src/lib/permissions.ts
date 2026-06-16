import { createAccessControl } from "better-auth/plugins/access";

/**
 * Define the resources and actions available in the CRM.
 * The admin plugin already provides built-in "user" and "session" resources.
 * CRM domain resources are defined here for granular permission control.
 */
const statement = {
  // Built-in auth resources
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "delete",
    "set-password",
  ],
  session: ["list", "revoke", "delete"],

  // CRM domain resources
  landlord: ["create", "read", "update", "delete"],
  tenant: ["create", "read", "update", "delete"],
  property: ["create", "read", "update", "delete"],
  lease: ["create", "read", "update", "delete"],
  payment: ["create", "read", "update", "delete"],
  service: ["create", "read", "update", "delete"],
  accounting: ["create", "read", "delete"],
  calendar: ["create", "read", "delete"],
  document: ["create", "read", "delete"],
  settings: ["read", "update"],
  "exchange-rate": ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

/** Full access — can manage users, roles, bans, and all CRM resources */
export const adminRole = ac.newRole({
  user: ["create", "list", "set-role", "ban", "delete", "set-password"],
  session: ["list", "revoke", "delete"],
  landlord: ["create", "read", "update", "delete"],
  tenant: ["create", "read", "update", "delete"],
  property: ["create", "read", "update", "delete"],
  lease: ["create", "read", "update", "delete"],
  payment: ["create", "read", "update", "delete"],
  service: ["create", "read", "update", "delete"],
  accounting: ["create", "read", "delete"],
  calendar: ["create", "read", "delete"],
  document: ["create", "read", "delete"],
  settings: ["read", "update"],
  "exchange-rate": ["read", "update"],
});

/** Regular staff — day-to-day ops, restricted financial/admin access */
export const staffRole = ac.newRole({
  user: ["list"],
  session: [],
  landlord: ["create", "read", "update", "delete"],
  tenant: ["create", "read", "update", "delete"],
  property: ["create", "read", "update", "delete"],
  lease: ["create", "read"],
  payment: ["create", "read", "update"],
  service: ["create", "read", "update", "delete"],
  accounting: ["read"],
  calendar: ["create", "read", "delete"],
  document: ["create", "read"],
  settings: ["read"],
  "exchange-rate": ["read"],
});

/**
 * Accounting — finance-focused. Full control over the ledger, disbursements,
 * payments and settlements; sensitive landlord data (bank/RRN); read-only on
 * properties/AS. Can be combined with `staff`/`admin` (multi-role).
 */
export const accountingRole = ac.newRole({
  user: ["list"],
  session: [],
  landlord: ["read", "update"],
  tenant: ["read"],
  property: ["read"],
  lease: ["read"],
  payment: ["create", "read", "update", "delete"],
  service: ["read"],
  accounting: ["create", "read", "delete"],
  calendar: ["create", "read"],
  document: ["create", "read"],
  settings: ["read"],
  "exchange-rate": ["read", "update"],
});

/** Pending approval — no permissions */
export const pendingRole = ac.newRole({
  user: [],
  session: [],
  landlord: [],
  tenant: [],
  property: [],
  lease: [],
  payment: [],
  service: [],
  accounting: [],
  calendar: [],
  document: [],
  settings: [],
  "exchange-rate": [],
});
