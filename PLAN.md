# Kings Realty Platform - Implementation Plan

## Context

Kings Realty is a real estate business in South Korea that rents properties to US military officers/soldiers. The business:
- Gets permission from Korean landlords to rent properties to US military
- Works with a partner real estate office for main contracts
- Collects rent + utility payments from tenants (USD or KRW) since tenants lack Korean bank accounts
- Pays landlords (wire/cash) and utility companies on tenants' behalf
- Provides maintenance/after-service (small fixes in-house, large ones escalated to landlord)
- Manages 100+ properties

This platform is an **internal staff tool** (Korean only) with role-based access (admin vs staff).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Database | PostgreSQL (Neon serverless) |
| Query Builder | Kysely |
| Auth | better-auth (Kysely adapter, admin plugin) |
| UI | shadcn/ui |
| Hosting | Vercel + Neon |
| File Storage | Vercel Blob (for document/bill uploads) |

---

## Database Schema

### Auth Tables (managed by better-auth)
- `user` - staff accounts (email, name, role)
- `session` - auth sessions
- `account` - OAuth/credential accounts
- `verification` - email verification tokens

### Core Business Tables

```
landlord
├── id (uuid, PK)
├── name (varchar)
├── phone (varchar)
├── email (varchar, nullable)
├── bank_name (varchar, nullable)
├── bank_account (varchar, nullable)
├── notes (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)

property
├── id (uuid, PK)
├── landlord_id (uuid, FK → landlord)
├── address (varchar)
├── address_detail (varchar, nullable)  -- 상세주소
├── property_type (varchar)  -- 아파트, 빌라, 단독주택, etc.
├── size_pyeong (decimal, nullable)  -- 평수
├── rooms (int, nullable)
├── bathrooms (int, nullable)
├── monthly_rent_krw (decimal)  -- 월세 (to landlord)
├── deposit_krw (decimal)  -- 보증금
├── permission_status (varchar)  -- pending, approved, rejected
├── status (varchar)  -- available, occupied, maintenance
├── notes (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)

tenant
├── id (uuid, PK)
├── name (varchar)
├── rank (varchar, nullable)  -- 계급
├── unit (varchar, nullable)  -- 소속 부대
├── phone (varchar)
├── email (varchar, nullable)
├── status (varchar)  -- active, inactive
├── notes (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)

tenant_family_member
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenant)
├── name (varchar)
├── relationship (varchar)  -- spouse, child, etc.
├── phone (varchar, nullable)
├── notes (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)

lease
├── id (uuid, PK)
├── property_id (uuid, FK → property)
├── tenant_id (uuid, FK → tenant)
├── start_date (date)
├── end_date (date)
├── monthly_rent_krw (decimal)  -- 세입자 월세
├── deposit_krw (decimal)
├── status (varchar)  -- active, expired, terminated
├── notes (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)

utility_type
├── id (uuid, PK)
├── name (varchar)  -- 전기, 가스, 수도, 인터넷, custom
├── is_default (boolean)
└── created_at (timestamp)

exchange_rate
├── id (uuid, PK)
├── date (date, unique)
├── usd_to_krw (decimal)  -- 1 USD = ? KRW
├── set_by (uuid, FK → user)
├── created_at (timestamp)
└── updated_at (timestamp)

payment
├── id (uuid, PK)
├── lease_id (uuid, FK → lease)
├── payment_type (varchar)  -- rent, deposit, utility, service
├── billing_month (date)  -- 청구 월 (YYYY-MM-01)
├── amount_krw (decimal)  -- 원화 금액
├── currency_paid (varchar)  -- USD or KRW
├── amount_paid (decimal)  -- 실제 납부 금액
├── exchange_rate_id (uuid, FK → exchange_rate, nullable)
├── payment_method (varchar)  -- cash, card, transfer
├── payment_date (date)
├── status (varchar)  -- pending, paid, overdue
├── paid_by_tenant (boolean, default true)  -- true=본인, false=가족
├── paid_by_family_member_id (uuid, FK → tenant_family_member, nullable)
├── notes (text, nullable)
├── received_by (uuid, FK → user)
├── created_at (timestamp)
└── updated_at (timestamp)

utility_bill
├── id (uuid, PK)
├── lease_id (uuid, FK → lease)
├── utility_type_id (uuid, FK → utility_type)
├── billing_month (date)
├── amount_krw (decimal)
├── due_date (date, nullable)
├── paid_to_company (boolean, default false)
├── paid_to_company_date (date, nullable)
├── payment_id (uuid, FK → payment, nullable)  -- linked tenant payment
├── notes (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)

service_request
├── id (uuid, PK)
├── lease_id (uuid, FK → lease)
├── title (varchar)
├── description (text)
├── category (varchar)  -- 전기, 배관, 기타, etc.
├── status (varchar)  -- received, in_progress, escalated, completed
├── cost_krw (decimal, nullable)
├── escalated_to_landlord (boolean, default false)
├── resolved_at (timestamp, nullable)
├── logged_by (uuid, FK → user)
├── notes (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)

document
├── id (uuid, PK)
├── entity_type (varchar)  -- lease, property, utility_bill, service_request, payment
├── entity_id (uuid)
├── file_name (varchar)
├── file_url (varchar)
├── file_type (varchar)  -- pdf, image, etc.
├── uploaded_by (uuid, FK → user)
├── created_at (timestamp)
└── updated_at (timestamp)

-- Accounting
ledger_entry
├── id (uuid, PK)
├── entry_type (varchar)  -- income, expense
├── category (varchar)  -- rent_income, utility_income, service_income, rent_expense, utility_expense, service_expense, other
├── amount_krw (decimal)
├── description (text)
├── payment_id (uuid, FK → payment, nullable)
├── reference_type (varchar, nullable)  -- links to related entity
├── reference_id (uuid, nullable)
├── entry_date (date)
├── recorded_by (uuid, FK → user)
├── created_at (timestamp)
└── updated_at (timestamp)
```

---

## Project Structure

```
kingsrealty/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── sign-in/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx              -- sidebar nav, header
│   │   │   ├── page.tsx               -- dashboard home (overview)
│   │   │   ├── properties/
│   │   │   │   ├── page.tsx           -- property list
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx      -- property detail
│   │   │   ├── landlords/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── tenants/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── leases/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── payments/
│   │   │   │   ├── page.tsx           -- payment list + quick entry
│   │   │   │   ├── new/page.tsx       -- record new payment
│   │   │   │   └── [id]/page.tsx      -- payment detail + receipt
│   │   │   ├── utilities/
│   │   │   │   ├── page.tsx           -- monthly utility overview
│   │   │   │   └── [leaseId]/page.tsx -- bills for specific lease
│   │   │   ├── services/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── exchange-rate/
│   │   │   │   └── page.tsx           -- set daily rate
│   │   │   ├── accounting/
│   │   │   │   ├── page.tsx           -- ledger overview
│   │   │   │   └── reports/page.tsx   -- income/expense reports
│   │   │   └── settings/
│   │   │       ├── page.tsx           -- utility types, general config
│   │   │       └── users/page.tsx     -- staff management (admin only)
│   │   ├── api/
│   │   │   ├── auth/[...all]/route.ts
│   │   │   └── upload/route.ts        -- file upload endpoint
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                        -- shadcn components
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── nav-links.tsx
│   │   ├── forms/                     -- reusable form components
│   │   ├── tables/                    -- data table components
│   │   └── receipt/
│   │       └── receipt-template.tsx   -- printable receipt
│   ├── db/
│   │   ├── index.ts                   -- Kysely instance
│   │   ├── types.ts                   -- Database type definitions
│   │   └── migrations/
│   │       ├── 001_auth_tables.ts
│   │       ├── 002_landlords.ts
│   │       ├── 003_properties.ts
│   │       ├── 004_tenants.ts
│   │       ├── 005_tenant_family_members.ts
│   │       ├── 006_leases.ts
│   │       ├── 007_utility_types.ts
│   │       ├── 008_exchange_rates.ts
│   │       ├── 009_payments.ts
│   │       ├── 010_utility_bills.ts
│   │       ├── 011_service_requests.ts
│   │       ├── 012_documents.ts
│   │       └── 013_ledger_entries.ts
│   ├── lib/
│   │   ├── auth.ts                    -- better-auth server config
│   │   ├── auth-client.ts            -- better-auth client
│   │   └── utils.ts                   -- formatting, currency helpers
│   └── middleware.ts                  -- auth middleware
├── public/
├── .env.local
├── components.json                    -- shadcn config
├── next.config.ts
├── package.json
├── tsconfig.json
├── PLAN.md
└── migrate.ts                         -- migration runner script
```

---

## Implementation Phases

### Phase 1: Project Bootstrap
1. Initialize Next.js project with TypeScript
2. Set up Neon database, get connection string
3. Configure Kysely with Neon's serverless driver (`@neondatabase/serverless`)
4. Set up better-auth with Kysely adapter + admin role plugin
5. Initialize shadcn/ui
6. Create auth pages (sign-in) and dashboard layout with sidebar
7. Set up middleware for route protection
8. Create migration runner script

### Phase 2: Core Data Management
1. Run migrations for landlord, property, tenant, lease tables
2. Build CRUD pages for:
   - Landlords (list, create, edit, detail)
   - Properties (list, create, edit, detail with landlord link)
   - Tenants (list, create, edit, detail)
   - Leases (list, create, edit, detail linking property + tenant)
3. Data tables with search, filter, pagination (shadcn data-table)
4. Document upload system (Vercel Blob) - attach files to any entity

### Phase 3: Payment & Billing System
1. Exchange rate management page (daily manual entry)
2. Utility type configuration (전기, 가스, 수도, 인터넷 + custom types)
3. Monthly utility bill entry per lease (with bill image upload)
4. Payment recording:
   - Select tenant/lease
   - Line items: rent + individual utilities
   - Choose currency (USD/KRW), auto-calculate with daily rate
   - Payment method (cash, card, transfer)
5. Receipt generation (printable + digital)
   - Shows line items, exchange rate used, total in both currencies

### Phase 4: Service Requests & Accounting
1. Service request logging (staff creates, tracks status)
2. Escalation workflow (mark as escalated to landlord)
3. Ledger entries auto-created from payments
4. Manual ledger entries for expenses (paying landlord, paying utility companies)
5. Accounting reports:
   - Monthly income/expense summary
   - Per-property profit/loss
   - Outstanding payments

### Phase 5: Dashboard & Polish
1. Dashboard overview page:
   - Properties summary (occupied/available)
   - Overdue payments
   - Open service requests
   - Today's exchange rate status
2. Staff management (admin only) - create/deactivate staff accounts
3. Search across all entities
4. Data export (CSV)

---

## Key Design Decisions

- **Polymorphic documents table**: Single `document` table with `entity_type` + `entity_id` to attach files to any entity (lease contracts, utility bills, service request photos, etc.)
- **Separate utility_bill from payment**: Bills come in first (tenant brings bill), then payment is recorded later. They're linked via `payment_id` on utility_bill.
- **Exchange rate as separate table**: Historical rates preserved, each payment links to the rate used that day.
- **Ledger entries auto-generated**: When a payment is recorded, corresponding ledger entries are created automatically. Staff can also add manual entries for expenses.
- **Neon serverless driver**: Use `@neondatabase/serverless` instead of `pg` Pool for Vercel edge compatibility.

---

## Verification Plan

After each phase:
1. **Phase 1**: Can sign in, see empty dashboard, middleware blocks unauthenticated access
2. **Phase 2**: Can CRUD all entities, upload documents, link lease to property + tenant
3. **Phase 3**: Can set exchange rate, enter bills, record payment in USD/KRW, print receipt
4. **Phase 4**: Can log service request, view accounting reports with correct totals
5. **Phase 5**: Dashboard shows live stats, admin can manage staff accounts
