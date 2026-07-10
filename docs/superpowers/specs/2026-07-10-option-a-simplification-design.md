# Option A Simplification — One Simple App for Everyone

**Date:** 2026-07-10
**Status:** Approved direction (Option A chosen over role-based Option B)
**Visual comparison:** https://claude.ai/code/artifact/fdc325be-b3bf-424c-a4e0-369c246f2853

## Context

Staff migrated off the legacy 유비플러스 SMART 고객관리 desktop ERP onto this platform, then reverted. Every user — staff *and* admins — is non-technical. The legacy ERP won on three things:

1. **One flat record.** Its 고객등록 modal holds tenant + lease + landlord + house in ~16 fields on one screen. No entity chain.
2. **Payments as a flat ledger.** Pick customer, pick charge items, type amounts. The 판매내역 list with a running total *is* their accounting (actively used: 81 entries in July 2026).
3. **Everything on one screen.** Roster left, flat detail right, payment history bottom, memo as catch-all.

The new platform fights that mental model: 11 nav destinations; a fully-set-up tenant requires 4 entities across 4 forms in dependency order (임대인 → 매물 → 세입자 → 계약); the tenant form front-loads 13 optional military-metadata fields; two parallel lease-creation paths exist; the one-shot intake (계약서로 등록) is buried in a page header.

**Decision:** simplify the product for everyone (Option A). No role-based "simple mode" — admins are as non-technical as staff. The relational data model stays; only the surface flattens.

## Goals

- A user who knew the old ERP can do their whole day (record payments, look up a customer, check the calendar) with zero training.
- Beat the old ERP on effectiveness via things it couldn't do: 미납 tracking, contract-expiry warnings, lease document generation.
- Get staff to abandon the old ERP for daily payment entry (measurable: payments/week recorded in the new system).

## Non-goals

- SMS/문자 sending — dropped entirely (confirmed not needed).
- Role-based navigation or a separate admin surface (Option B rejected).
- Schema changes — this is a surface redesign over the existing data model.

## Design

### 1. Navigation: 11 items → 5 + 설정

| Current | New home |
|---|---|
| 대시보드, 알림 | **오늘** (single home screen; 알림 becomes a header bell) |
| 세입자 (계약 folded inside) | **고객** — flat-card workspace |
| 수납 | **수납** — ledger + collector |
| 캘린더 | **캘린더** — unchanged |
| 매물, 임대인, 비품 | **자산** — one house-centric list; landlord & appliances inside each house |
| 환율, 점검 체크리스트, 설정 | **설정** |
| AS 요청 | Customer card section + queue on 오늘 (no top-level item) |

### 2. 고객 — flat card workspace (the heart)

Keeps the shipped master-detail bones (roster rail + detail pane). The detail pane becomes a **flat card** that reads across tenant + lease + property + landlord:

- Header: name, 계급·기지 chip, phone, 계약 D-day chip.
- Stat strip: 월세, 보증금, 계약기간, 미납 (미납 red when nonzero; roster rows show a 미납 badge).
- Facts: 주소 + 현관비번, 집주인 이름·연락처.
- 메모 always visible (free-text catch-all, existing rich-text notes).
- Recent 수납 rows + one primary **수납 등록** button.
- Below the fold, collapsed sections: 가족·반려동물, 군 정보 (branch/rank/unit/DEROS/dependents), 비품, AS, 문서(계약서).
- Editing is per-section inline edit. Never one giant form.

**새 고객 = one static page** with old-ERP field parity: 이름\*, 연락처\*, 계급, 부대, 주소, 집주인 이름/연락처, 보증금, 월세, 계약시작/만료, 메모. Only name + phone required. Behind the scenes it creates tenant → lease → property → landlord as needed, reusing existing landlords/properties by name/address match (the existing LeaseIntakeForm logic becomes this single front door). **No conditional show/hide fields** — one page, top to bottom, skip what you don't know. The two parallel lease forms (LeaseForm, LeaseIntakeForm) collapse into this one path; standalone lease creation survives only as "계약 추가" from a customer card.

### 3. 수납 — ledger + collector

- Collector unchanged (pick tenant → outstanding charges auto-fill → ⌘+Enter). It already matches the old ERP's speed.
- Payments list reframed as the old 판매내역: flat chronological ledger, month filter, running total pinned at the bottom. Must feel instantly familiar.

### 4. 오늘 — home screen

Old dashboard's 3 month-metric cards (입주/수납액/퇴거 — already built) plus operational lists, every row deep-linking to the exact customer card:

- 오늘 일정 (calendar events)
- 미납 명단
- 계약 만료 임박 (D-30/D-60)
- 열린 AS 요청

No new charts. 알림 moves to a header bell icon.

### 5. 자산 — one quiet screen

Simple house list: 주소, 상태 (거주중 with tenant name / 공실), 집주인 이름·연락처, 비품 count. House detail shows landlord and appliances inline. The separate 매물/임대인/비품 top-level screens retire. Serves the occasional "which houses are empty?" question, not daily work.

### 6. AS 요청 — kept, mobile-friendly

AS is field work: staff stand in the house on a phone. Requirements:

- Log/update an AS request from the customer card and from the 오늘 queue.
- These surfaces must work well on mobile: large touch targets, photo attach, status update in one or two taps.
- No separate top-level AS screen.

### 7. Simplification rules (global)

- Required fields only where the business can't proceed without them (typically name/phone/amount); everything else optional; 메모 as escape hatch.
- No conditional field reveals; no multi-step wizards.
- Korean-only labels, large click targets; keep the collector's keyboard flow.
- 환율: auto-applied in the collector; manual override lives in 설정.

### 8. Cutover plan

Staff kept entering payments into the old ERP after the 2026-06-17 re-import, so the new DB is stale. Adoption depends on trustworthy 미납 numbers.

1. Ship the redesign.
2. Final export from the old ERP → re-import payments/customers (reuse import-platform.ts pipeline).
3. Pick a switch day; old ERP becomes read-only reference.
4. Track adoption: payments recorded per week in the new system.

## Error handling & edge cases

- 새 고객 with only name+phone: creates a bare tenant; card shows empty-state prompts ("계약 정보 추가") instead of blocking.
- Address entered free-text without Postcodify match: accept it; property record stores raw address (search-by-address still works on raw text). Postcodify becomes assist, not gate.
- Landlord/property reuse on intake: match by exact phone (landlord) and normalized address (property); on ambiguity, create new rather than block — admins can merge later via 자산.
- Deleting/retiring top-level screens must preserve deep links (redirects from /properties, /landlords, /appliances, /leases to the new homes).

## Testing

- Existing route/component tests updated for the new nav and merged screens.
- Intake form: unit tests for the entity-chain writer (tenant-only, tenant+lease, full chain, reuse-by-match paths).
- Manual mobile pass on AS flows (card section + 오늘 queue) at phone widths.

## Build order (suggested phases)

1. **고객 card + 새 고객 one-page intake** (removes the 4-form chain — biggest win)
2. **Navigation collapse + 오늘 + 자산 merge** (with redirects)
3. **수납 ledger reframe** (smallest change; collector already done)
4. **AS mobile polish**
5. **Cutover** (re-import + switch day)

Each phase gets its own implementation plan.
