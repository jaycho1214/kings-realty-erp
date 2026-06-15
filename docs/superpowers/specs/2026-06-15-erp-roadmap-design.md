# 미군 임대 관리 ERP — 구현 로드맵 (Master Spec)

- **작성일**: 2026-06-15
- **기준 문서**: 기획서 v1.1 + 운영자 추가 피드백 3건
- **대상 앱**: `apps/crm` (Next.js 16 / React 19 / Kysely / better-auth / shadcn)
- **성격**: 마스터 로드맵. 각 워크패키지(WP)는 이후 개별 spec → plan → 구현 사이클로 진행한다.

> 이 문서는 "기획서의 모든 기능 구현"을 위해 **현재 코드베이스와 기획서의 격차**를 정의하고, 13개 워크패키지를 5개 페이즈로 나눠 실행 순서를 확정한 것이다. 세부 구현(컬럼 타입, UI 와이어프레임, 테스트)은 각 WP 착수 시 별도 spec에서 확정한다.

---

## 1. 현재 상태 요약

CRM은 이미 상당 부분 구축되어 있으나, 기획서와 **다른 데이터 모델**을 기반으로 만들어졌다.

- **라우트**: landlords / properties / tenants / leases / payments(+bundle) / services / calendar / exchange-rate / settings(data·users)
- **결제 모델**: **수금-중심(collect-and-allocate)**. `payment` 한 행 = 라인아이템 1건(rent/utility/service)을 수금 시점에 생성, `bill_paid` 플래그로 대납 처리. "미납/미청구" 같은 청구 레이어는 없음.
- **`ledger_entry` 테이블은 존재하나 UI가 없어 사실상 미사용.**
- **소프트 삭제 미구현**: 어느 테이블에도 `is_deleted`/`deleted_at` 컬럼이 없다. 현재는 하드 삭제.
- **RBAC**: better-auth access-control로 `admin` / `staff` / `pending` 3개 역할. `accounting` 없음.
- **누락 모듈(테이블 자체 없음)**: OHA 기준표, 환전업체, 입주/퇴거 점검, 보증금 정산, 알림(notification), realty_fee_default.

---

## 2. 확정된 결정 (Resolved)

| #   | 항목                     | 결정                                                                                                                                                                                                                 |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 진행 방식                | 전체 로드맵 1건 작성 → 페이즈/WP 단위로 순차 실행                                                                                                                                                                    |
| 2   | 임차인·계약 페이지 병합  | **Tenant-centric**: 계약을 임차인 상세 안으로 흡수(현재+과거 계약 인라인), 상단 `계약` 네비 제거                                                                                                                     |
| 3   | 임대인 주민등록번호(RRN) | `accounting` 역할 신설, **admin+accounting만** 조회/수정. 암호화 저장 · 기본 마스킹 · 명시적 reveal + 감사 로그                                                                                                      |
| 4   | 퇴거 임차인 자동 처리    | 소프트 삭제(복구 가능). `퇴거 + 계약 종료일 경과` → 자동 archive, archive 6개월 후 → 소프트 삭제(휴지통). 영구 삭제는 admin 수동                                                                                     |
| 5   | 청구/원장 모델           | **원장(ledger)이 backbone** — 모든 입·출금 기록(통화/권종/환율/환전업체/러닝밸런스). **청구(charge_item)는 선택적 오버레이로 주로 월세에만** 적용(미납/연체 추적). 공과금·일회성은 청구 없이 원장+번들 수금으로 처리 |

---

## 3. 격차 분석 (Spec ↔ Current)

| 기획서 모듈                      | 상태 | 보완 필요                                                               | 담당 WP |
| -------------------------------- | ---- | ----------------------------------------------------------------------- | ------- |
| §4.1 임대인                      | 🟡   | address, 사업자/개인, 예금주, **RRN(암호화·게이팅)**                    | A2      |
| §4.2 매물                        | 🟢   | status enum(공실/입주대기중/입주중/move_out), `moveout_date`            | A3      |
| §4.3 임차인                      | 🟡   | `dependent_status`(with/without), military_id, OHA 한도 표시            | A3·E1   |
| §4.4 OHA 기준표                  | 🔴   | 테이블+시딩+마스터 UI+임차인 조회                                       | E1      |
| §4.5 계약                        | 🟡   | 임대인측/임차인측 분리, `realty_fee`, `auto_renew`, status enum         | A3      |
| §4.6 청구 항목                   | 🟡   | charge_item(월세 월 자동생성·미납 상태머신)                             | C2      |
| §4.7 정산 원장                   | 🟡   | direction/currency/denomination/rate/vendor/running-balance             | C1      |
| §4.7 환전업체                    | 🔴   | 마스터 신설                                                             | C1      |
| §4.8 대납                        | 🟡   | `bearer`(임차인/임대인/중개), `payee`, status(납부대기/완료/보류)       | C3      |
| §4.9 입주/퇴거 점검              | 🔴   | 테이블+UI(체크리스트/사진/참여자/입퇴거 비교)                           | D2      |
| §4.10 AS                         | 🟡   | 6-상태 머신, bearer/location/assignee/일정/비용/연기사유/사진, 대시보드 | D1      |
| §4.11 보증금 정산                | 🔴   | 테이블+UI(수동 차감·확정·환급)                                          | D3      |
| §4.12 마스터: realty_fee_default | 🔴   | 시딩+UI                                                                 | A3·E3   |
| §7.1 계약 만료 알림              | 🔴   | notification 테이블 + D-60/30/7 + 알림 센터                             | E2      |
| §2 RBAC: accounting              | 🟡   | 역할 신설                                                               | A1      |
| 피드백#1 퇴거 자동처리           | 🔴   | 라이프사이클 + 스케줄 잡                                                | B1      |
| 피드백#2 페이지 병합             | 🔴   | tenant-centric 재구성                                                   | B2      |

---

## 4. 횡단 관심사 (Cross-cutting)

각 WP가 공유하는 기반 요소. 처음 필요한 WP에서 만들고 이후 재사용한다.

### 4.1 스케줄 잡 (B1, E2 공용)

- Next.js에는 내장 크론이 없음 → **인증된 크론 라우트** `app/api/cron/daily/route.ts` 신설, `CRON_SECRET` 헤더 검증.
- 배포(Vercel 가정)에서 `vercel.json` crons로 매일 1회 호출. 외부 스케줄러로도 대체 가능.
- 잡 내용: (a) 퇴거+계약종료 임차인 archive, (b) archive 6개월 경과 임차인 soft-delete, (c) 계약 만료 D-60/30/7 알림 생성. **멱등(idempotent)** 하게 작성(중복 실행 안전).

### 4.2 RRN 암호화 (A2)

- 애플리케이션 레벨 **AES-256-GCM**. 키는 `RRN_ENC_KEY`(env). 컬럼에는 ciphertext(+iv+tag) 저장.
- 복호화는 **서버에서만**, admin/accounting 세션 확인 후. 평문은 명시적 `reveal` 서버액션 응답으로만 클라이언트 전달.
- 기본 표시는 서버에서 마스킹(`••••••-•••••••`). reveal 시 `audit_log` 기록.

### 4.3 감사 로그 (A1/A2, D3 공용)

- 범용 `audit_log` 테이블: `actor_id`, `action`(예: `rrn.reveal`, `settlement.confirm`), `entity_type`, `entity_id`, `detail jsonb`, `created_at`. 민감 조회·확정 액션에 사용.

### 4.4 소프트 삭제 컨벤션 (B1에서 도입)

- 현재 전무. B1에서 `tenant`에 `deleted_at timestamptz NULL` 도입하고, 목록 쿼리에서 `deleted_at IS NULL` 필터를 표준화. 다른 엔티티로의 확장은 필요 시 후속.

---

## 5. 워크패키지 상세

각 WP: **목표 · 스키마 변경 · 핵심 동작 · 권한 · 의존성**. 인수 기준은 착수 spec에서 확정.

### Phase A — 기반 & 빠른 성과

#### A1 · `accounting` 역할 신설

- **목표**: 기획서 §2 RBAC에 회계 역할 추가. RRN·정산 확정 게이팅의 전제.
- **변경**: `lib/permissions.ts`에 `accountingRole` 추가(원장·대납·정산 전체 권한, 매물/AS 조회 위주). `lib/authz.ts`에 `isAccounting`/`canViewSensitive` 헬퍼. 사용자 관리 UI(`settings/users`) 역할 셀렉트에 옵션 추가. better-auth admin 플러그인 role 문자열은 콤마구분 멀티롤 지원하므로 그대로 활용.
- **권한**: 역할 부여는 admin만.
- **의존성**: 없음. (소규모)

#### A2 · 임대인 필드 보강 + RRN

- **목표**: 기획서 §4.1 + 피드백 #3.
- **변경**: `landlord`에 `address`, `business_type`(개인/사업자), `account_holder`(예금주), `rrn_encrypted`(text, nullable) 추가. `audit_log` 도입(4.3). 횡단 4.2 암호화 유틸 `lib/rrn.ts`.
- **핵심 동작**: 임대인 폼에서 RRN 입력 가능(admin/accounting만 필드 노출). 상세는 기본 마스킹 + `reveal` 버튼(서버액션→감사로그). 비권한자에게는 필드 자체 미노출(서버에서 제거, 클라이언트로 ciphertext도 안 보냄).
- **권한**: RRN read/update = admin/accounting. 기타 임대인 필드 = 기존 정책.
- **의존성**: A1.

#### A3 · 매물 + 계약(Contract) 모델 정합

- **목표**: §4.2 매물 status/moveout, §4.5 계약 양측 조건·realty_fee·auto_renew·상태머신. 청구/점검/정산의 기반.
- **변경(매물)**: `property.status` 값 체계를 `available→공실 / pending_move_in→입주대기중 / occupied→입주중 / move_out` 으로 정리(기존 `available` 매핑, 마이그레이션으로 값 정규화), `moveout_date date NULL` 추가.
- **변경(계약/lease)**: `landlord_deposit_krw`, `landlord_rent_krw`(임대인측), 기존 `deposit_krw`/`monthly_rent_krw`는 임차인측으로 의미 고정. `realty_fee`, `realty_fee_currency`(USD/KRW), `auto_renew boolean`, `status` enum(draft/active/expired/terminated/renewed)으로 확장(기존 active 유지). `landlord_id`는 property 경유로 파생(중복 저장 안 함).
- **마스터**: `realty_fee_default`(currency, amount) 신설 + 시딩(USD 300 / KRW 500,000). 계약 생성 시 초기값 복사.
- **의존성**: 없음(이후 C·D 페이즈의 기반).

### Phase B — 피드백 완성

#### B1 · 임차인 라이프사이클 (자동 archive + 소프트 삭제)

- **목표**: 피드백 #1.
- **변경**: `tenant.status`에 `archived` 추가, `archived_at timestamptz NULL`, `deleted_at timestamptz NULL`. 횡단 4.1 크론 잡, 4.4 소프트삭제 컨벤션.
- **핵심 동작**:
  - **Archive 조건**: `status='moved_out'` AND 해당 임차인의 최신 계약 `end_date < today` → `archived` + `archived_at=now`.
  - **Soft-delete 조건**: `archived_at < today-6mo` → `deleted_at=now`(목록/검색에서 숨김).
  - admin **휴지통** 화면: soft-deleted 임차인 조회/복구/영구삭제.
  - 모든 임차인 목록 쿼리에 `deleted_at IS NULL` 적용, 기본 목록은 `archived` 제외(필터로 표시).
- **권한**: 복구/영구삭제 = admin.
- **의존성**: A3(계약 end_date 기준), 크론 라우트.

#### B2 · 임차인·계약 병합 (Tenant-centric)

- **목표**: 피드백 #2 (확정: tenant-centric).
- **핵심 동작**: 사이드바에서 `계약` 항목 제거. 임차인 상세에 **계약 탭/섹션**(현재 계약 강조 + 과거 계약 이력) 인라인. 계약 생성/수정은 임차인 상세에서 진입. `/leases/[id]`는 PDF·딥링크용으로 유지하되 목록 페이지(`/leases`)는 임차인으로 redirect 또는 제거.
- **주의**: PDF 생성(`api/leases/[id]/pdf`), 검색, 캘린더 연동의 lease 참조 경로 회귀 점검.
- **의존성**: A3.

### Phase C — 자금 코어

#### C1 · 원장(Ledger) + 환전업체

- **목표**: §4.7. **원장을 backbone으로 재구성.**
- **변경(ledger_entry 확장)**: `tenant_id`, `contract_id`, `direction`(receipt/disbursement), `currency`(USD/KRW), `denomination`(nullable), `exchange_rate`(nullable), `exchange_vendor_id`(FK nullable), `krw_amount`(환산), `related_charge_id`/`related_payable_id`, `entry_date`, `memo`. 기존 컬럼과의 정합은 마이그레이션으로.
- **마스터**: `exchange_vendor`(name, denominations jsonb, default_rate, phone, memo) 신설.
- **핵심 동작**: 임차인 상세 **원장 탭** — 날짜/구분/항목/통화/권종/환율/환전업체/원화환산/잔액(러닝밸런스)/메모/증빙. 한 입금에 권종별 다중 라인(권종별 환율·환전업체 상이). 기존 `payment`을 원장 입금으로 연결(이중기록 방지: payment↔ledger 매핑 규칙 확정).
- **권한**: 원장 생성/삭제 = admin/accounting(+staff read).
- **의존성**: A3.

#### C2 · 청구(charge_item) — 월세 중심

- **목표**: §4.6. 결정 #5에 따라 **월세 등 지정된 정기 항목에만** 적용.
- **변경**: `charge_item`(tenant_id, contract_id, type, recurrence(one_time/monthly), billing_month, amount, currency, due_date, status(미청구/청구됨/수납완료/부분납/미납), memo).
- **핵심 동작**: 월세 charge 월 자동생성(전월 복제). 원장 입금과 연결되면 status 갱신(수납완료/부분납). 미납/연체 표면화(임차인 상세·홈 대시보드).
- **의존성**: C1.

#### C3 · 대납(Payable) 보강

- **목표**: §4.8.
- **변경**: `utility_bill` → payable 확장: `bearer`(임차인/임대인/중개), `payee`, `status`(납부대기/납부완료/보류), `paid_date`. 기존 `paid_to_company` 매핑.
- **핵심 동작**: 매물/임차인 단위 월별 대납 묶음 + 일괄 납부(기존 bundle 뷰 강화). 납부 완료 시 원장 출금 자동 기록. 미납/마감 임박 강조.
- **의존성**: C1.

### Phase D — 운영

#### D1 · AS 리워크 + 대시보드

- **목표**: §4.10 + §7.2.
- **변경(service_request)**: `status` 6-상태(접수/수리대기중/수리중/수리완료/수리연기/개인처리결정)로 확장(기존 received/in_progress/completed 매핑), `bearer`(임대인/임차인/중개), `location`, `assignee`, `scheduled_date`, `completed_date`, `estimated_cost`, `actual_cost`, `postpone_reason`. 사진은 기존 `document`(polymorphic) 활용. 상태 이력은 기존 `service_request_status_log` 활용.
- **핵심 동작**: 한 매물 다건 AS(이미 lease 단위로 가능). **AS 대시보드**: 상태별 카드+목록, 필터/정렬, 지연/예약초과 강조.
- **의존성**: 없음(독립).

#### D2 · 입주/퇴거 점검 (Inspection)

- **목표**: §4.9.
- **변경**: `inspection`(contract_id, property_id, type(move_in/move_out), inspected_at, participants jsonb, checklist jsonb, photos(document 연계), signature jsonb, summary) 신설.
- **핵심 동작**: 입주 점검 완료 → 매물 `입주중` 전환 유도. 퇴거 점검 완료 → 매물 `move_out`+moveout_date, 보증금 정산 연계. 입주↔퇴거 체크리스트/사진 **나란히 비교**.
- **의존성**: A3(매물 status).

#### D3 · 보증금 정산 (Deposit Settlement)

- **목표**: §4.11 (수동).
- **변경**: `deposit_settlement`(contract_id, deposit_amount, deductions jsonb[금액/사유/증빙], deduction_total, refund_amount, refunded_date, confirmed_by, status(작성중/확정)) 신설.
- **핵심 동작**: 퇴거 점검에서 진입. 차감 항목 수동 입력+증빙, 차감합계 자동, 환급액=보증금−차감. 확정 = admin/accounting(감사로그). 환급 처리 → 원장 출금 연결.
- **의존성**: A1, C1, D2.

### Phase E — OHA · 알림 · 홈

#### E1 · OHA 기준표

- **목표**: §4.4.
- **변경**: `oha_rate`(rank, dependent_status(with/without), region(기본 Default), amount, currency(USD), effective_from, effective_to nullable) 신설 + 시딩 스크립트. `tenant.dependent_status`(A3에서 추가) 기준 매칭.
- **핵심 동작**: 마스터 UI(admin) — 계급·부양·적용기간 필터, 요율 개정은 기존 행 종료+신규 행. 임차인 상세에 해당 시점 유효 OHA 한도 표시(표시·비교용, 자동 차감 없음).
- **열린 항목**: **실제 OHA 금액표 필요**. 미제공 시 예시 행으로 시딩 후 UI에서 수정.
- **의존성**: A3(dependent_status).

#### E2 · 계약 만료 알림 + 알림 센터

- **목표**: §7.1 + §5.15.
- **변경**: `notification`(type, target_user_id, ref_entity_type, ref_entity_id, due_date, is_read) 신설. 크론 잡에 D-60/30/7 생성 추가.
- **핵심 동작**: 알림 센터(목록·읽음처리·바로가기), `auto_renew` 계약 별도 라벨. 대시보드 위젯 "이번 달/다음 달 만료 예정".
- **의존성**: A3(계약 end_date/auto_renew), 크론 라우트.

#### E3 · 홈 대시보드 + 마스터 마감

- **목표**: §8 #1, §4.12 완결.
- **핵심 동작**: 홈에 AS 현황 카드(D1), 만료 예정 계약(E2), 미납(C2)/대납 임박(C3) 요약. 마스터 데이터 화면(`settings/data`)에 realty_fee_default·oha_rate·exchange_vendor·청구/대납 유형 편집 일원화.
- **의존성**: C2, C3, D1, E2.

---

## 6. 실행 순서 (확정)

```
A1 → A2 → A3   (기반 + RRN)
B1 → B2        (피드백 완성)
C1 → C2 → C3   (자금 코어)
D1 ; D2 → D3   (운영; D1 독립, D2→D3 순차)
E1 ; E2 → E3   (OHA 독립; 알림→홈)
```

- Phase A·B는 소규모·고가치(3개 피드백 모두 포함) → 초반 모멘텀.
- Phase C가 가장 무겁다.
- 각 WP 완료 시 회귀 점검: 검색(`api/search`), 캘린더, lease PDF, 권한 게이팅.

## 7. 열린 항목 (운영자 확인 필요)

1. **실제 OHA 금액표**(계급×부양×지역) — E1 시딩용. 미제공 시 예시 시딩.
2. 배포 환경의 크론 수단(Vercel Cron 가정) — 다르면 알려줄 것.
3. 기존 운영 데이터 존재 여부/규모 — C1/A3 마이그레이션(값 정규화·이중기록 방지) 설계에 영향.

---

_이 로드맵 승인 후, 첫 워크패키지(A1)부터 개별 spec → plan → 구현으로 진행한다._
