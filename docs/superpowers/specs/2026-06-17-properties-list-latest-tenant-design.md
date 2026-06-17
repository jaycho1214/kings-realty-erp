# Properties list — latest tenant per property

**Date:** 2026-06-17
**Status:** Approved
**Scope:** `apps/crm/src/app/(dashboard)/properties/page.tsx` (one file)

## Problem

On the `/properties` list page you can't see who occupies (or last occupied) a
property without opening its detail page. Operationally it helps to see, at a
glance, the latest tenant for each property.

## Decision

- **List page:** show the **latest tenant only** per property, as a clickable
  link to that tenant's detail page.
- **Detail page:** unchanged — it already shows the full lease/tenant history in
  the "임대 계약" tab.

## Data

Tenant history per property lives in the `lease` table (`property_id` →
`tenant_id`, with `start_date`/`end_date`/`status`). The "latest tenant" is the
tenant on the most recent lease (by `start_date desc`).

After the existing properties query runs, collect the page's property IDs and
run one extra query (added to the existing `Promise.all`, so no added latency):

```sql
SELECT DISTINCT ON (lease.property_id)
       lease.property_id, tenant.id, tenant.name, lease.status, lease.end_date
FROM lease
JOIN tenant ON tenant.id = lease.tenant_id
WHERE lease.property_id IN (<page ids>) AND tenant.deleted_at IS NULL
ORDER BY lease.property_id, lease.start_date DESC;
```

(`DISTINCT ON` via Kysely's `.distinctOn()`.) Build a
`Map<property_id, latestTenant>`. Skip the query entirely when the page has no
properties.

## Display

A muted sub-line in the address cell, beneath the address / `address_detail`,
matching the existing sub-line pattern:

```
안정리 123-4
  201호
  현재 · 김임대          ← clickable → /tenants/[id]
```

- Tenant name is a `Link` to `/tenants/[id]`. The address link and the tenant
  link are sibling elements in the cell (no nested anchors).
- State-aware prefix: **현재** when the latest lease status is `active`, **이전**
  otherwise.
- Properties with no lease history render nothing extra (no noise).

## Out of scope

- No DB migration.
- No detail-page changes.
- No tenure dates on the list line (kept brief; full history is on the detail
  page).
