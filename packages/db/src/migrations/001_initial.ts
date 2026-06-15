import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Auth tables (Better Auth - camelCase, serial IDs) ────────────────

  await db.schema
    .createTable("user")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("emailVerified", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("image", "text")
    .addColumn("role", "text") // enum: 'admin' | 'staff' | 'pending'
    .addColumn("banned", "boolean")
    .addColumn("banReason", "text")
    .addColumn("banExpires", "timestamptz")
    .addColumn("calendar_token", "text", (col) => col.unique())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("session")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("ipAddress", "text")
    .addColumn("userAgent", "text")
    .addColumn("userId", "integer", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .execute();

  await db.schema
    .createTable("account")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("accountId", "text", (col) => col.notNull())
    .addColumn("providerId", "text", (col) => col.notNull())
    .addColumn("userId", "integer", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("accessToken", "text")
    .addColumn("refreshToken", "text")
    .addColumn("idToken", "text")
    .addColumn("accessTokenExpiresAt", "timestamptz")
    .addColumn("refreshTokenExpiresAt", "timestamptz")
    .addColumn("scope", "text")
    .addColumn("password", "text")
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("verification")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("identifier", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Lookup / reference tables ──────────────────────────────────────

  await db.schema
    .createTable("base_location")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(100)", (col) => col.notNull())
    .addColumn("name_ko", "varchar(100)")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("utility_type")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar", (col) => col.notNull().unique())
    .addColumn("is_default", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("event_category")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("value", "varchar(50)", (col) => col.notNull().unique())
    .addColumn("label", "varchar(100)", (col) => col.notNull())
    .addColumn("icon", "varchar(10)", (col) => col.notNull())
    .addColumn("description", "varchar(200)", (col) =>
      col.notNull().defaultTo(""),
    )
    .addColumn("is_default", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("service_category")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("value", "varchar(50)", (col) => col.notNull().unique())
    .addColumn("label", "varchar(100)", (col) => col.notNull())
    .addColumn("is_default", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Landlords ──────────────────────────────────────────────────────

  await db.schema
    .createTable("landlord")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("phone", "varchar", (col) => col.notNull())
    .addColumn("email", "varchar")
    .addColumn("bank_name", "varchar")
    .addColumn("bank_account", "varchar")
    .addColumn("sex", "varchar")
    .addColumn("birth", "date")
    .addColumn("notes", "text")
    .addColumn("created_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("landlord_family_member")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("landlord_id", "integer", (col) =>
      col.notNull().references("landlord.id").onDelete("cascade"),
    )
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("relationship", "varchar", (col) => col.notNull())
    .addColumn("phone", "varchar")
    .addColumn("sex", "varchar")
    .addColumn("birth", "date")
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Properties ─────────────────────────────────────────────────────

  await db.schema
    .createTable("property")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("landlord_id", "integer", (col) =>
      col.notNull().references("landlord.id").onDelete("restrict"),
    )
    .addColumn("address", "varchar", (col) => col.notNull())
    .addColumn("address_detail", "varchar")
    .addColumn("property_type", "varchar", (col) => col.notNull())
    .addColumn("size_pyeong", "decimal")
    .addColumn("rooms", "integer")
    .addColumn("bathrooms", "integer")
    .addColumn("monthly_rent_krw", "decimal", (col) => col.notNull())
    .addColumn("deposit_krw", "decimal", (col) => col.notNull())
    .addColumn("permission_status", "varchar", (col) =>
      col.notNull().defaultTo("pending"),
    )
    .addColumn("status", "varchar", (col) =>
      col.notNull().defaultTo("available"),
    )
    .addColumn("management_phone", "varchar")
    .addColumn("notes", "text")
    .addColumn("created_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("property_equipment")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("property_id", "integer", (col) =>
      col.notNull().references("property.id").onDelete("cascade"),
    )
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("paid_by", "varchar", (col) => col.notNull())
    .addColumn("monthly_cost_krw", "decimal", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Tenants ────────────────────────────────────────────────────────

  await db.schema
    .createTable("tenant")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("rank", "varchar")
    .addColumn("unit", "varchar")
    .addColumn("phone", "varchar", (col) => col.notNull())
    .addColumn("email", "varchar")
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("active"))
    .addColumn("sex", "varchar")
    .addColumn("birth", "date")
    .addColumn("branch", "varchar")
    .addColumn("deros", "date")
    .addColumn("base_location_id", "integer", (col) =>
      col.notNull().references("base_location.id"),
    )
    .addColumn("notes", "text")
    .addColumn("created_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("tenant_family_member")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenant.id").onDelete("cascade"),
    )
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("relationship", "varchar", (col) => col.notNull())
    .addColumn("phone", "varchar")
    .addColumn("sex", "varchar")
    .addColumn("birth", "date")
    .addColumn("base_location_id", "integer", (col) =>
      col.references("base_location.id"),
    )
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("tenant_pet")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenant.id").onDelete("cascade"),
    )
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("species", "varchar", (col) => col.notNull())
    .addColumn("breed", "varchar")
    .addColumn("size", "varchar(20)")
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("tenant_note")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenant.id").onDelete("cascade"),
    )
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("created_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Leases ─────────────────────────────────────────────────────────

  await db.schema
    .createTable("lease")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("property_id", "integer", (col) =>
      col.notNull().references("property.id").onDelete("restrict"),
    )
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenant.id").onDelete("restrict"),
    )
    .addColumn("start_date", "date", (col) => col.notNull())
    .addColumn("end_date", "date", (col) => col.notNull())
    .addColumn("monthly_rent_krw", "decimal", (col) => col.notNull())
    .addColumn("deposit_krw", "decimal", (col) => col.notNull())
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("active"))
    .addColumn("notes", "text")
    .addColumn("created_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Exchange rates ─────────────────────────────────────────────────

  await db.schema
    .createTable("exchange_rate")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("date", "date", (col) => col.notNull())
    .addColumn("usd_to_krw", "decimal", (col) => col.notNull())
    .addColumn("denomination", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("set_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("exchange_rate_date_denomination_key", [
      "date",
      "denomination",
    ])
    .execute();

  // ─── Payments ───────────────────────────────────────────────────────

  await db.schema
    .createTable("payment")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("lease_id", "integer", (col) =>
      col.notNull().references("lease.id").onDelete("restrict"),
    )
    .addColumn("payment_type", "varchar", (col) => col.notNull())
    .addColumn("billing_month", "date", (col) => col.notNull())
    .addColumn("amount_krw", "decimal", (col) => col.notNull())
    .addColumn("currency_paid", "varchar", (col) => col.notNull())
    .addColumn("amount_paid", "decimal", (col) => col.notNull())
    .addColumn("exchange_rate_id", "integer", (col) =>
      col.references("exchange_rate.id"),
    )
    .addColumn("payment_method", "varchar", (col) => col.notNull())
    .addColumn("payment_date", "date", (col) => col.notNull())
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("pending"))
    .addColumn("paid_by_tenant", "boolean", (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn("paid_by_family_member_id", "integer", (col) =>
      col.references("tenant_family_member.id"),
    )
    .addColumn("bundle_id", "text") // grouping identifier for bundled payments
    .addColumn("bill_paid", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("bill_paid_at", "timestamptz")
    .addColumn("bill_paid_by", "integer", (col) => col.references("user.id"))
    .addColumn("notes", "text")
    .addColumn("received_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Utility bills ──────────────────────────────────────────────────

  await db.schema
    .createTable("utility_bill")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("lease_id", "integer", (col) =>
      col.notNull().references("lease.id").onDelete("restrict"),
    )
    .addColumn("utility_type_id", "integer", (col) =>
      col.notNull().references("utility_type.id"),
    )
    .addColumn("billing_month", "date", (col) => col.notNull())
    .addColumn("amount_krw", "decimal", (col) => col.notNull())
    .addColumn("due_date", "date")
    .addColumn("paid_to_company", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("paid_to_company_date", "date")
    .addColumn("payment_id", "integer", (col) => col.references("payment.id"))
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Service requests ───────────────────────────────────────────────

  await db.schema
    .createTable("service_request")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("lease_id", "integer", (col) =>
      col.notNull().references("lease.id").onDelete("restrict"),
    )
    .addColumn("title", "varchar", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("category", "varchar", (col) => col.notNull())
    .addColumn("status", "varchar", (col) =>
      col.notNull().defaultTo("received"),
    )
    .addColumn("cost_krw", "decimal")
    .addColumn("escalated_to_landlord", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("resolved_at", "timestamptz")
    .addColumn("logged_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("service_request_status_log")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("service_request_id", "integer", (col) =>
      col.notNull().references("service_request.id").onDelete("cascade"),
    )
    .addColumn("status", "varchar", (col) => col.notNull())
    .addColumn("changed_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("note", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Documents ──────────────────────────────────────────────────────

  await db.schema
    .createTable("document")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("entity_type", "varchar", (col) => col.notNull())
    .addColumn("entity_id", "integer", (col) => col.notNull()) // polymorphic FK
    .addColumn("title", "varchar")
    .addColumn("file_name", "varchar", (col) => col.notNull())
    .addColumn("file_url", "varchar", (col) => col.notNull())
    .addColumn("file_type", "varchar", (col) => col.notNull())
    .addColumn("comments", "text")
    .addColumn("uploaded_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Ledger entries ─────────────────────────────────────────────────

  await db.schema
    .createTable("ledger_entry")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("entry_type", "varchar", (col) => col.notNull())
    .addColumn("category", "varchar", (col) => col.notNull())
    .addColumn("amount_krw", "decimal", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("payment_id", "integer", (col) => col.references("payment.id"))
    .addColumn("reference_type", "varchar")
    .addColumn("reference_id", "integer")
    .addColumn("entry_date", "date", (col) => col.notNull())
    .addColumn("recorded_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // ─── Calendar ───────────────────────────────────────────────────────

  await db.schema
    .createTable("calendar_event")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("title", "varchar(255)", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("date", "date", (col) => col.notNull())
    .addColumn("end_date", "date")
    .addColumn("start_time", "varchar(5)")
    .addColumn("end_time", "varchar(5)")
    .addColumn("is_all_day", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("color", "varchar(50)", (col) =>
      col.notNull().defaultTo("primary"),
    )
    .addColumn("category", "varchar(50)", (col) =>
      col.notNull().defaultTo("general"),
    )
    .addColumn("urgency", "varchar(20)", (col) =>
      col.notNull().defaultTo("normal"),
    )
    .addColumn("location", "varchar(255)")
    .addColumn("property_id", "integer", (col) => col.references("property.id"))
    .addColumn("tenant_id", "integer", (col) => col.references("tenant.id"))
    .addColumn("created_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("calendar_event_attendee")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("event_id", "integer", (col) =>
      col.notNull().references("calendar_event.id").onDelete("cascade"),
    )
    .addColumn("attendee_type", "varchar(20)", (col) => col.notNull())
    .addColumn("attendee_id", "text", (col) => col.notNull()) // text: can reference user.id or stringified entity IDs
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("uq_event_attendee", [
      "event_id",
      "attendee_type",
      "attendee_id",
    ])
    .execute();

  // ─── Indexes ────────────────────────────────────────────────────────

  await db.schema
    .createIndex("idx_property_landlord")
    .on("property")
    .column("landlord_id")
    .execute();
  await db.schema
    .createIndex("idx_property_status")
    .on("property")
    .column("status")
    .execute();
  await db.schema
    .createIndex("idx_property_equipment_property")
    .on("property_equipment")
    .column("property_id")
    .execute();
  await db.schema
    .createIndex("idx_landlord_email")
    .on("landlord")
    .column("email")
    .execute();
  await db.schema
    .createIndex("idx_landlord_phone")
    .on("landlord")
    .column("phone")
    .execute();
  await db.schema
    .createIndex("idx_landlord_family_member_landlord_id")
    .on("landlord_family_member")
    .column("landlord_id")
    .execute();
  await db.schema
    .createIndex("idx_tenant_email")
    .on("tenant")
    .column("email")
    .execute();
  await db.schema
    .createIndex("idx_tenant_phone")
    .on("tenant")
    .column("phone")
    .execute();
  await db.schema
    .createIndex("idx_tenant_status")
    .on("tenant")
    .column("status")
    .execute();
  await db.schema
    .createIndex("idx_family_member_tenant")
    .on("tenant_family_member")
    .column("tenant_id")
    .execute();
  await db.schema
    .createIndex("idx_tenant_pet_tenant")
    .on("tenant_pet")
    .column("tenant_id")
    .execute();
  await db.schema
    .createIndex("idx_lease_property")
    .on("lease")
    .column("property_id")
    .execute();
  await db.schema
    .createIndex("idx_lease_tenant")
    .on("lease")
    .column("tenant_id")
    .execute();
  await db.schema
    .createIndex("idx_lease_status")
    .on("lease")
    .column("status")
    .execute();
  await db.schema
    .createIndex("idx_exchange_rate_set_by")
    .on("exchange_rate")
    .column("set_by")
    .execute();
  await db.schema
    .createIndex("idx_payment_lease")
    .on("payment")
    .column("lease_id")
    .execute();
  await db.schema
    .createIndex("idx_payment_status")
    .on("payment")
    .column("status")
    .execute();
  await db.schema
    .createIndex("idx_payment_billing_month")
    .on("payment")
    .column("billing_month")
    .execute();
  await db.schema
    .createIndex("idx_payment_bundle_id")
    .on("payment")
    .column("bundle_id")
    .execute();
  await db.schema
    .createIndex("idx_payment_bill_paid")
    .on("payment")
    .column("bill_paid")
    .execute();
  await db.schema
    .createIndex("idx_utility_bill_lease")
    .on("utility_bill")
    .column("lease_id")
    .execute();
  await db.schema
    .createIndex("idx_utility_bill_month")
    .on("utility_bill")
    .column("billing_month")
    .execute();
  await db.schema
    .createIndex("idx_service_request_lease")
    .on("service_request")
    .column("lease_id")
    .execute();
  await db.schema
    .createIndex("idx_service_request_status")
    .on("service_request")
    .column("status")
    .execute();
  await db.schema
    .createIndex("idx_sr_status_log_sr_id")
    .on("service_request_status_log")
    .column("service_request_id")
    .execute();
  await db.schema
    .createIndex("idx_document_entity")
    .on("document")
    .columns(["entity_type", "entity_id"])
    .execute();
  await db.schema
    .createIndex("idx_document_uploaded_by")
    .on("document")
    .column("uploaded_by")
    .execute();
  await db.schema
    .createIndex("idx_ledger_entry_date")
    .on("ledger_entry")
    .column("entry_date")
    .execute();
  await db.schema
    .createIndex("idx_ledger_entry_type")
    .on("ledger_entry")
    .column("entry_type")
    .execute();
  await db.schema
    .createIndex("idx_ledger_entry_category")
    .on("ledger_entry")
    .column("category")
    .execute();
  await db.schema
    .createIndex("idx_ledger_entry_recorded_by")
    .on("ledger_entry")
    .column("recorded_by")
    .execute();
  await db.schema
    .createIndex("idx_calendar_event_created_by")
    .on("calendar_event")
    .column("created_by")
    .execute();
  await db.schema
    .createIndex("idx_calendar_event_date")
    .on("calendar_event")
    .column("date")
    .execute();

  // ─── Seed data ──────────────────────────────────────────────────────

  const typedDb = db as Kysely<Record<string, Record<string, unknown>>>;

  await typedDb
    .insertInto("base_location")
    .values([
      { name: "K-16", name_ko: "K-16", sort_order: 1 },
      { name: "Osan", name_ko: "오산", sort_order: 2 },
    ])
    .execute();

  await typedDb
    .insertInto("utility_type")
    .values([
      { name: "전기", is_default: true },
      { name: "가스", is_default: true },
      { name: "수도", is_default: true },
      { name: "인터넷", is_default: true },
      { name: "선불금", is_default: true },
    ])
    .execute();

  const eventCategories = [
    {
      value: "inspection",
      label: "매물 점검",
      icon: "🏠",
      description: "매물 상태 확인 및 점검",
      sort_order: 1,
    },
    {
      value: "move_in",
      label: "입주",
      icon: "📦",
      description: "세입자 입주 일정",
      sort_order: 2,
    },
    {
      value: "move_out",
      label: "퇴거",
      icon: "🚚",
      description: "세입자 퇴거 일정",
      sort_order: 3,
    },
    {
      value: "contract_renewal",
      label: "계약 갱신",
      icon: "📝",
      description: "계약 갱신 미팅/처리",
      sort_order: 4,
    },
    {
      value: "landlord_meeting",
      label: "임대인 미팅",
      icon: "🤝",
      description: "임대인과의 미팅",
      sort_order: 5,
    },
    {
      value: "repair",
      label: "수리 일정",
      icon: "🔧",
      description: "매물 수리/보수 일정",
      sort_order: 6,
    },
    {
      value: "payment_reminder",
      label: "수납 알림",
      icon: "💰",
      description: "수납 관련 알림",
      sort_order: 7,
    },
    {
      value: "utility_deadline",
      label: "공과금 납부",
      icon: "⚡",
      description: "공과금 납부 기한",
      sort_order: 8,
    },
    {
      value: "general",
      label: "기타",
      icon: "📌",
      description: "일반 일정",
      sort_order: 99,
    },
  ];
  for (const cat of eventCategories) {
    await typedDb
      .insertInto("event_category")
      .values({ ...cat, is_default: true })
      .execute();
  }

  const serviceCategories = [
    { value: "electrical", label: "전기", sort_order: 1 },
    { value: "plumbing", label: "배관", sort_order: 2 },
    { value: "hvac", label: "냉난방", sort_order: 3 },
    { value: "appliance", label: "가전", sort_order: 4 },
    { value: "structural", label: "구조", sort_order: 5 },
    { value: "pest", label: "방역", sort_order: 6 },
    { value: "other", label: "기타", sort_order: 99 },
  ];
  for (const cat of serviceCategories) {
    await typedDb
      .insertInto("service_category")
      .values({ ...cat, is_default: true })
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("calendar_event_attendee").ifExists().execute();
  await db.schema.dropTable("calendar_event").ifExists().execute();
  await db.schema.dropTable("ledger_entry").ifExists().execute();
  await db.schema.dropTable("document").ifExists().execute();
  await db.schema.dropTable("service_request_status_log").ifExists().execute();
  await db.schema.dropTable("service_request").ifExists().execute();
  await db.schema.dropTable("utility_bill").ifExists().execute();
  await db.schema.dropTable("payment").ifExists().execute();
  await db.schema.dropTable("exchange_rate").ifExists().execute();
  await db.schema.dropTable("lease").ifExists().execute();
  await db.schema.dropTable("tenant_note").ifExists().execute();
  await db.schema.dropTable("tenant_pet").ifExists().execute();
  await db.schema.dropTable("tenant_family_member").ifExists().execute();
  await db.schema.dropTable("tenant").ifExists().execute();
  await db.schema.dropTable("property_equipment").ifExists().execute();
  await db.schema.dropTable("property").ifExists().execute();
  await db.schema.dropTable("landlord_family_member").ifExists().execute();
  await db.schema.dropTable("landlord").ifExists().execute();
  await db.schema.dropTable("service_category").ifExists().execute();
  await db.schema.dropTable("event_category").ifExists().execute();
  await db.schema.dropTable("utility_type").ifExists().execute();
  await db.schema.dropTable("base_location").ifExists().execute();
  await db.schema.dropTable("verification").ifExists().execute();
  await db.schema.dropTable("account").ifExists().execute();
  await db.schema.dropTable("session").ifExists().execute();
  await db.schema.dropTable("user").ifExists().execute();
}
