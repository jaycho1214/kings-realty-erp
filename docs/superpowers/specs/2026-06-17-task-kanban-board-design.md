# 할 일(To-do) 칸반 보드 — Design

- **작성일**: 2026-06-17
- **대상 앱**: `apps/crm` (Next.js 16 / React 19 / Kysely / better-auth / shadcn)
- **성격**: 단일 구현 spec. 승인 후 writing-plans 로 구현 계획 작성.

> 모든 스태프가 공유하는 칸반 보드. "오늘 무엇을 할지"를 직접 정렬하고(계획 뷰), 워크플로 상태로도 보며(상태 뷰), 운영 신호(계약 만료·미납·AS·DEROS)에서 자동으로 **추천 카드**를 받는다. 보드는 **대시보드가 홈**이고(기존 PaymentBoard 대체), 그 외 모든 페이지에서는 **FAB → Sheet** 로 어디서든 보고 빠르게 추가한다.

---

## 1. 목표

- 스태프 전원이 공유하는 단일 할 일 보드. 카드는 자유 입력(manual) 또는 추천(suggestion)에서 생성.
- 하나의 카드를 **두 축**으로 본다: **언제 할지(계획)** 와 **워크플로 상태**. 뷰 토글로 전환.
- 운영상 해야 할 일을 자동으로 **추천 레일**에 띄우고, `추가` 한 번으로 실제 카드로 전환.
- 대시보드에서 바로 보이고, 다른 페이지에서는 FAB로 접근.

## 2. 확정된 결정 (Resolved)

| # | 항목 | 결정 |
| - | ---- | ---- |
| 1 | 보드 소유 | **공유 보드**. 모든 스태프가 모든 카드를 보고 편집. 카드별 담당자(assignee) 다중 지정. |
| 2 | 뷰 | **두 가지 뷰 토글**: `계획`(오늘/이번 주/예정/완료) · `상태`(할 일/진행 중/완료). |
| 3 | 필터 | `전체 / 내 할 일` 토글 + 특정 담당자 선택. 클라이언트 측 필터. |
| 4 | 추천 동작 | `추가` → 실제 카드 생성(dedup), `무시`(영구) / `나중에`(7일 스누즈). 추천 무시/스누즈는 **팀 전체** 공유. |
| 5 | 서피스 | 대시보드 = 보드 홈(기존 PaymentBoard **대체**). 그 외 페이지 = **FAB → Sheet**. **전용 `/tasks` 네비 페이지는 두지 않음.** |
| 6 | 삭제 권한 | 카드 작성자 또는 admin 만 삭제. 그 외 필드 편집은 스태프 전원 가능. |
| 7 | 토스트 | 코드베이스에 토스트 라이브러리 없음 → **인라인 에러 + 옵티미스틱 롤백**(신규 의존성 추가 안 함). |

## 3. 데이터 모델 (`packages/db/src/migrations/020_task.ts`)

기존 컨벤션(snake_case, `created_at`/`updated_at` defaultNow, `service_request_assignee` 다대다 패턴)을 따른다.

### `task`

| 컬럼 | 타입 | 비고 |
| ---- | ---- | ---- |
| `id` | serial PK | |
| `title` | text NOT NULL | |
| `notes` | text NULL | |
| `status` | text NOT NULL default `'todo'` | `todo` \| `in_progress` \| `done` |
| `planned_date` | date NULL | **계획 뷰 버킷의 기준**. null = 예정(미계획) |
| `due_date` | date NULL | **하드 마감일**. 카드의 D-day/연체 배지로만 표시. 드래그로 변하지 않음 |
| `sort_order` | double precision NOT NULL | 컬럼 내 수동 우선순위. 드롭 시 양 이웃의 중간값 |
| `source` | text NOT NULL default `'manual'` | `manual` \| `suggestion` |
| `suggestion_key` | text NULL | 추천에서 생성된 카드의 dedup 키(아래 §6). manual = null |
| `ref_entity_type` | text NULL | `lease` \| `tenant` \| `service_request` \| `charge_item` 등 |
| `ref_entity_id` | integer NULL | 원본 엔티티로 딥링크 |
| `created_by` | integer NOT NULL → user | |
| `completed_at` | timestamptz NULL | `status='done'` 전환 시 set, 재오픈 시 null |
| `created_at` / `updated_at` | timestamptz default now | |

인덱스: `(status)`, `(planned_date)`, `(suggestion_key)` 부분 인덱스(NOT NULL).

### `task_assignee` (다대다)

| 컬럼 | 타입 |
| ---- | ---- |
| `id` | serial PK |
| `task_id` | integer NOT NULL → task (cascade delete) |
| `user_id` | integer NOT NULL → user |
| `created_at` | timestamptz default now |

유니크: `(task_id, user_id)`.

### `task_suggestion_dismissal` (팀 전체 공유)

| 컬럼 | 타입 | 비고 |
| ---- | ---- | ---- |
| `id` | serial PK | |
| `dedup_key` | text NOT NULL | §6 추천 dedup 키 |
| `dismissed_until` | date NULL | null = 영구 무시, 날짜 = 해당일까지 스누즈 |
| `dismissed_by` | integer NULL → user | 감사용 |
| `created_at` | timestamptz default now | |

유니크: `(dedup_key)` — 같은 키 재무시 시 upsert.

> 마이그레이션 후 `kysely-codegen` 으로 `packages/db/src/types.ts` 재생성(수동 편집 금지 파일).

## 4. 두 가지 뷰

뷰 토글(`계획 | 상태`)은 클라이언트 상태. 두 뷰 모두 **컬럼 내 정렬은 `sort_order` 오름차순**, 완료 컬럼은 **최근 7일 내 완료분만** 표시(누적 방지). 기준 "오늘"·주 경계는 `Asia/Seoul`(기존 `lib/date` 헬퍼).

### 계획 뷰 — 컬럼: 오늘 / 이번 주 / 예정 / 완료

`planned_date`를 오늘 기준으로 버킷팅:

- **완료**: `status='done'` AND `completed_at >= 오늘-7일`
- **오늘**: `status≠done` AND `planned_date <= 오늘` (지난 계획·이월 포함)
- **이번 주**: `status≠done` AND `오늘 < planned_date <= 이번주 일요일`
- **예정**: `status≠done` AND (`planned_date IS NULL` OR `planned_date > 이번주 일요일`)

드래그 드롭 시:

- → **오늘**: `planned_date = 오늘`
- → **이번 주**: `planned_date = 이번주 일요일`(이미 이번 주 범위면 유지)
- → **예정**: `planned_date = null`
- → **완료**: `status='done'`, `completed_at=now` (planned_date 유지)
- **완료에서 빼낼 때**: `status='todo'`, `completed_at=null`

이 모델 덕분에 손대지 않은 "오늘" 카드는 다음 날 자동으로 다시 "오늘"(이월)로 보인다. 하드 마감일(`due_date`)은 컬럼과 무관하게 카드 배지(D-7 / **연체**=빨강)로만 표시.

### 상태 뷰 — 컬럼: 할 일 / 진행 중 / 완료

- **할 일**: `status='todo'`
- **진행 중**: `status='in_progress'`
- **완료**: `status='done'` (최근 7일)

드래그 드롭 시 `status` 변경(완료 시 `completed_at` 동기화). `planned_date`는 건드리지 않음.

> 두 뷰가 같은 `sort_order` 하나를 공유한다(= 전역 수동 우선순위). 한 뷰에서 재정렬하면 다른 뷰의 같은 컬럼 정렬에도 반영된다. 의도된 단순화(뷰별 별도 순서는 YAGNI).

## 5. 필터

보드 상단 바: `전체 | 내 할 일` 토글 + 담당자 select(특정 스태프). 로딩된 카드 집합에 대한 클라이언트 필터(서버 재요청 없음). FAB Sheet 는 기본 `내 할 일`.

## 6. 추천 엔진 (`apps/crm/src/lib/tasks/suggestions.ts`)

순수 함수형 **provider** 집합. 각 provider 가 신호를 조회해 `SuggestedTask[]` 반환 → 합친 뒤 (a) 활성 task 의 `suggestion_key`(= `status≠done`)와 겹치는 것, (b) 활성 dismissal(`dismissed_until IS NULL OR dismissed_until > 오늘`)을 가진 것을 제거.

`SuggestedTask`: `{ dedupKey, title, dueDate?, refEntityType, refEntityId, suggestedAssigneeIds? }`.

**v1 providers**:

| provider | dedup_key | 제목 예 | due_date | ref | 비고 |
| -------- | --------- | ------- | -------- | --- | ---- |
| 계약 만료 임박 | `lease_expiry:{lease_id}:{60\|30\|7}` | `계약 만료 D-30 · {tenant} {address}` | `lease.end_date` | lease | D-60/30/7 마일스톤. 활성/갱신 계약만 |
| 미납·연체 | `charge_due:{charge_item_id}` | `미납/연체 {type} · {tenant}` | `charge.due_date` | charge_item | `status in (billed, overdue)`, 금액 있는 건. overdue 는 카드에 **연체** 배지 |
| AS 처리 | `service_open:{service_request_id}` | `AS {category} · {address}` | `scheduled_date` | service_request | open 상태(received/pending_repair/in_progress/postponed). 담당자 prefill = `service_request_assignee` |
| DEROS 임박 | `deros:{tenant_id}:60` | `DEROS 임박 D-{n} · {tenant}` | `tenant.deros` | tenant | active 세입자, 60일 이내 |

> 후속 provider(같은 인터페이스): 입주/퇴거 점검 필요(property status vs inspection 부재), 보증금 정산 대기(`deposit_settlement.status='draft'`). v1 범위 밖.

**추천 카드 동작**:

- **추가** → `acceptSuggestion`: task 생성 — `source='suggestion'`, `suggestion_key=dedupKey`, `ref_*` 채움, AS면 담당자 prefill. 초기 `status='todo'`, `planned_date` = (`due_date < 오늘` → 오늘) · (`due_date <= 이번주 일요일` → due_date) · (그 외/없음 → null). 동시 추가 레이스는 `suggestion_key` 존재 확인으로 중복 방지.
- **무시** → `dismissSuggestion`: dismissal upsert(`dismissed_until=null`).
- **나중에** → `snoozeSuggestion`: dismissal upsert(`dismissed_until=오늘+7일`).

## 7. 서피스

보드는 **단일 `<TaskBoard>` 컴포넌트**를 두 레이아웃으로 렌더한다.

- `layout="columns"`: 데스크톱 — 컬럼 가로 배치 + 추천 레일.
- `layout="stack"`: 모바일 + FAB Sheet — 컬럼 세로 스택, 추천 접근 가능. (모바일 반응형에 어차피 필요한 레이아웃을 Sheet 가 재사용)

### 7.1 대시보드 (보드 홈)

`apps/crm/src/app/(dashboard)/page.tsx` 에서 기존 **`PaymentBoard` 를 `<TaskBoard layout="columns">` 로 교체**. 보드 데이터(task+assignee, 추천, 스태프 목록, 현재 유저)를 서버 컴포넌트에서 인라인 로드. 하단 통계 카드(이번 달 수납·미납 합계·AS 진행중·수납 추이)와 보조 패널은 **그대로 유지** — 미납·연체는 추천 레일에도 뜨고, 전체 수납 목록은 `/payments` 에 남으므로 정보 손실 없음. `payment-board.tsx` 는 미사용이 되므로 제거.

### 7.2 FAB (그 외 모든 페이지)

`apps/crm/src/components/layout/task-fab.tsx` (client), `app-shell.tsx` 에 마운트. 우하단 고정, **대시보드에서는 숨김**(보드가 이미 보임), 모바일 드로어 열림 중 숨김. 선택: 배지 = 내 오늘/연체 할 일 수.

클릭 → 우측 **Sheet**(기존 `ui/sheet.tsx`)에 `<TaskBoard layout="stack">` 렌더. 기본 `내 할 일` + `계획` 뷰, 상단 빠른 추가 입력, 추천 접근 가능.

FAB 는 클라이언트라 서버 prop 을 못 받으므로 Sheet 열릴 때 **`getTaskBoardData()` 서버 액션으로 지연 로드**, 자체 옵티미스틱 상태 보유, 변경 후 재요청.

## 8. 컴포넌트 & 데이터 흐름

신규/변경:

```
apps/crm/src/
  app/(dashboard)/
    page.tsx                      # PaymentBoard → TaskBoard 교체 + 보드 데이터 로드
    _components/
      task-board.tsx              # (client) 뷰 토글·필터·dnd 컬럼·추천 레일. layout prop
      task-card.tsx               # (client) 제목·담당자 아바타·due 배지·ref 링크
      suggestion-rail.tsx         # (client) 추천 카드 + 추가/무시/나중에
      task-dialog.tsx             # (client) 생성/수정(제목·메모·담당자·due_date)
    _task-actions.ts              # (server) 서버 액션 (§9)
    _components/payment-board.tsx # 제거(미사용)
  components/layout/
    task-fab.tsx                  # (client) FAB + Sheet, app-shell 에 마운트
    app-shell.tsx                 # TaskFab 추가
  lib/tasks/
    suggestions.ts                # 추천 엔진(provider + dedup/dismissal 필터)
    types.ts                      # Task/SuggestedTask/BoardData 등 공유 타입
    board.ts                      # 버킷 계산 + sort_order 중간값 등 순수 헬퍼
  lib/date.ts                     # endOfWeek(seoul) 헬퍼 추가
packages/db/src/migrations/020_task.ts
```

**데이터 흐름**:

- 서버 서피스(대시보드): 서버 컴포넌트가 보드 데이터 로드 → `<TaskBoard>` 에 prop 전달. 변경 액션은 `revalidatePath('/')`.
- 클라이언트 서피스(FAB): Sheet open 시 `getTaskBoardData()` 호출 → 클라이언트 상태 보유. 드롭/추가 등은 옵티미스틱 적용 후 액션 호출, 성공 시 유지·실패 시 롤백.
- 드래그: `@dnd-kit/core` + `@dnd-kit/sortable` 신규 추가. 드롭 시 새 `sort_order`(이웃 중간값) + 컬럼 변화에 따른 `status`/`planned_date` 계산 후 `moveTask` 호출.

## 9. 서버 액션 (`_task-actions.ts`)

전부 비-pending 스태프 게이팅(기존 `getSession`/authz). 입력 검증 후 typed 결과 반환.

- `createTask({ title, notes?, dueDate?, plannedDate?, assigneeIds? })`
- `updateTask(id, { title?, notes?, dueDate?, assigneeIds? })`
- `moveTask(id, { status?, plannedDate?, sortOrder })` — 드롭 영속화. `status='done'` 시 `completed_at` 동기화, 재오픈 시 null
- `deleteTask(id)` — **작성자 또는 admin** 만
- `setAssignees(id, userIds[])`
- `acceptSuggestion(dedupKey)` — §6. 중복 방지 후 task 생성
- `dismissSuggestion(dedupKey)` / `snoozeSuggestion(dedupKey)` — dismissal upsert
- `getTaskBoardData()` — FAB 용 보드 데이터 조회(task+assignee, 추천, 스태프, 현재 유저)

각 변경 액션은 서버 서피스용으로 `revalidatePath('/')`.

## 10. 권한

- 조회·편집·이동·추천 처리: admin/staff/accounting (pending 제외).
- 삭제: 카드 `created_by` 또는 admin.
- 모든 카드/추천은 팀 공유 — 담당자 미지정 카드는 누구나 claim(담당자 추가) 가능.

## 11. 에러 처리

- 토스트 라이브러리 미도입 → 옵티미스틱 변경 실패 시 **이전 상태로 롤백 + 인라인 에러 표기**(보드 상단 또는 카드 인접).
- `acceptSuggestion` 레이스: `suggestion_key` 존재 확인으로 중복 카드 차단(이미 있으면 no-op + 추천 목록에서 제거).
- 서버 액션은 권한·검증 실패를 typed 에러로 반환, 클라이언트가 표면화.

## 12. 테스트

순수 로직 위주(가장 가치 높음):

- **추천 엔진**: provider 입력 fixture → 기대 추천 산출, dedup(활성 task) · dismissal/snooze 필터 동작.
- **`board.ts` 헬퍼**: 계획 버킷 분류(경계: 오늘/주말/null/이월), `sort_order` 중간값 계산.

이들은 의존성 없는 순수 함수로 추출해 단위 테스트. dnd·Sheet·FAB 등 UI 는 실행 앱에서 수동 검증(verification-before-completion). 프로젝트에 테스트 러너가 없으면 해당 순수 모듈에 한해 최소 설정 추가.

## 13. 의존성 · 마이그레이션 · 회귀 점검

- 신규 패키지: `@dnd-kit/core`, `@dnd-kit/sortable` (`apps/crm`).
- 마이그레이션 `020_task.ts` 적용 → `kysely-codegen` 재생성.
- 네비게이션 변경 없음(전용 `/tasks` 페이지 미도입).
- 회귀: 대시보드 — `PaymentBoard` 제거 후 통계 카드/보조 패널·레이아웃 유지 확인. `payment-board.tsx` 다른 참조 없음 확인 후 제거. FAB 가 대시보드/모바일 드로어에서 숨겨지는지, z-index 가 모달 아래인지 확인.

## 14. 범위 밖 (YAGNI)

- 실시간 동기화(websocket) — 옵티미스틱 + revalidate 로 충분.
- 뷰별 독립 정렬 순서 — 단일 `sort_order` 공유.
- 점검/보증금 정산 추천 provider — 후속.
- 반복 할 일, 서브태스크, 코멘트, 첨부, 라벨 — 후속.
- 전용 `/tasks` 네비 페이지 — 필요 시 공유 컴포넌트로 즉시 추가 가능.
