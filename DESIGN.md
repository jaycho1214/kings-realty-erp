---
name: Kings Realty CRM
description: The Operations Desk — a clean, labeled, data-forward console for two-currency property operations
colors:
  bg: "oklch(1 0 0)"
  surface: "oklch(1 0 0)"
  sunken: "oklch(0.964 0.003 255)"
  ink: "oklch(0.24 0.012 262)"
  ink-muted: "oklch(0.52 0.011 262)"
  ink-subtle: "oklch(0.63 0.009 262)"
  line: "oklch(0.917 0.004 258)"
  line-soft: "oklch(0.945 0.003 258)"
  primary: "oklch(0.27 0.02 280)"
  primary-ink: "oklch(0.985 0.002 270)"
  accent: "oklch(0.55 0.17 277)"
  accent-weak: "oklch(0.966 0.022 277)"
  accent-line: "oklch(0.90 0.045 277)"
  success: "oklch(0.58 0.14 156)"
  success-weak: "oklch(0.965 0.03 158)"
  warning: "oklch(0.66 0.14 66)"
  warning-weak: "oklch(0.97 0.05 80)"
  danger: "oklch(0.58 0.20 25)"
  danger-weak: "oklch(0.966 0.035 25)"
typography:
  page-title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  figure:
    fontFamily: "ui-monospace, SF Mono, Geist Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  nav-item-active:
    backgroundColor: "{colors.accent-weak}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
  table-amount:
    typography: "{typography.figure}"
    textColor: "{colors.ink}"
---

# Design System: Kings Realty CRM

## 1. Overview

**Creative North Star: "The Operations Desk"**

Kings Realty CRM is the desk an operator sits at all day to run two-currency property operations: who paid, who owes, which lease is expiring, which soldier is rotating out, which unit needs a repair. The system's job is to keep every one of those answers labeled, organized, and one glance away on a calm, light surface. It should feel like a well-kept desk, not a spreadsheet and not a marketing dashboard.

The system rests on a **clean white field**: the canvas, navbar, sidebar, and panels all share one white surface, separated by soft hairline borders rather than tonal shifts or heavy shadows. A single working gray (Sunken) gives hover states, table headers, and the search field their definition. Navigation is **explicit and labeled** (a full-width top bar carrying identity and global actions, a grouped left sidebar carrying every section by name with live counts) so nothing hides behind an icon. Money and time are **data-forward**: every amount, rate, count, and date is set in a tabular monospace so figures line up and read exactly, and light data-viz (status bars, sparklines, a trend line, a triage board) turns the day's state into something scannable. A single **indigo accent**, spent sparingly, marks where you are and what you can act on.

This is a **product** surface: earned familiarity beats novelty. It borrows the clarity of modern work tools (Linear, Notion, the Relatel reference) but stays unmistakably a money tool. It rejects the **marketing-flashy** vocabulary its strategy warns against (decorative gradients, gradient text, persuasion copy, hero-metric theater that exists to impress rather than inform) and **toy-like over-animation** (bounce, elastic, choreographed page loads). Stat cards and charts are welcome here precisely because they carry real operational data, not because they look busy.

**Key Characteristics:**
- Labeled, grouped navigation: full-width top navbar + a below-it left sidebar, nothing icon-only.
- Money and figures in tabular monospace; columns align to the digit.
- Light layered surfaces (gray canvas, white panels, soft hairlines); flat, almost no shadow.
- One indigo accent for active/selected/primary; a four-state status color vocabulary for everything else.
- Calm density: ~10px radii, compact controls, generous-but-tight rhythm. Airy enough to read, dense enough to work.

## 2. Colors

A light cool-neutral system — clean gray neutrals at hue ~258–262 (no violet murk) carrying a single indigo accent at ~277 and a four-state status vocabulary.

### Primary
- **Indigo Accent** (`oklch(0.55 0.17 277)`): the one accent. Active nav item (on `accent-weak` fill), selected state, links, focus rings, the active-tab marker, and the "rent" type flag. Spent on ~10% of a screen, never decoration.
- **Ink** (`oklch(0.24 0.015 275)`): primary text and headings. The dark **Primary** (`oklch(0.27 0.02 280)`) fills the one primary button (결제 기록) with `primary-ink` text.

### Neutral
- **Canvas / Surface** (`oklch(1 0 0)`): the app background, navbar, sidebar, cards, and table rows are all pure white. Separation comes from hairline borders, not tonal contrast.
- **Sunken** (`oklch(0.964 0.003 255)`): the one working gray — search field, hover fills, table headers, inset wells. The only non-white surface, used to give interactive states and headers definition.
- **Ink Muted** (`oklch(0.52 0.011 262)`): secondary text, nav labels, captions. Clears 4.5:1 on Surface and on Canvas.
- **Ink Subtle** (`oklch(0.63 0.009 262)`): units, counts, micro-labels only; never load-bearing text.
- **Line** (`oklch(0.917 0.004 258)`) / **Line Soft** (`oklch(0.945 0.003 258)`): panel borders and the lighter internal dividers.

### Status (four states + neutral)
Each state has a saturated *ink* (dot, figure, text) and a *weak* tint (lane/tag fill). The single source of state color, used by status dots, alert tags, board lanes, and badges. **Never hand-roll status colors inline.**
- **Success / 완료·활성·공실** — `oklch(0.58 0.14 156)` on `oklch(0.965 0.03 158)`.
- **Warning / 미납·진행중·임박** — `oklch(0.66 0.14 66)` on `oklch(0.97 0.05 80)`.
- **Danger / 연체·만료·종료** — `oklch(0.58 0.20 25)` on `oklch(0.966 0.035 25)`.
- **Info / 점유·처리중** — Indigo Accent on `accent-weak`.
- **Neutral / 비활성·대기·취소** — Ink Muted on Sunken.

### Named Rules
**The One Voice Rule.** Indigo appears on at most ~10% of any screen — active nav, current selection, focus, links, one primary action. If two indigos compete, one is wrong.

**The Money-Is-Mono Rule.** Every currency amount, exchange rate, percentage, count, date, and D-countdown is tabular monospace and right-aligned in tables, with the `₩`/`$` mark kept on the figure.

## 3. Typography

**Body / UI Font:** Pretendard Variable (with `-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`)
**Figure Font:** `ui-monospace, "SF Mono", "Geist Mono", monospace`, tabular numerals (`"tnum"`)

**Character:** One humanist sans for all Korean and Latin text; one monospace for all numbers. The proportional-text / fixed-figure contrast is the identity — sentences read naturally, money reads like a ledger.

### Hierarchy
- **Page Title** (600, 1.25rem/20px, -0.02em): the compact page header. The ceiling.
- **Section** (600, 0.8125rem/13px): card and panel headings.
- **Body** (400, 0.875rem/14px): default text, cells, values. Prose caps ~70ch; data runs denser.
- **Label** (500, 0.6875rem/11px, +0.02em): captions, column heads, group labels. Non-actionable text only.
- **Figure** (500, mono, tnum): all numerics; KPI hero figures step to 22–26px, still mono.

### Named Rules
**The Fixed-Scale Rule.** Sizes are fixed rem, never fluid `clamp()`. A figure must read identically in a card and in a wide table.

## 4. Elevation

Near-flat, built from **soft hairline borders**. Surfaces are white; the only gray (Sunken) is reserved for hover states, table headers, and inset wells. Panels carry a `1px` Line border and no drop shadow. Depth is the border, not a shadow under every card.

### Shadow Vocabulary
Shadow is reserved for *transient overlays* that must read as lifted off the page.
- **Overlay** (`box-shadow: 0 8px 28px -8px oklch(0.24 0.015 275 / 0.18), 0 2px 6px oklch(0.24 0.015 275 / 0.08)`): dropdowns, the command palette, popovers, dialogs, the mobile sidebar drawer.

### Named Rules
**The Flat-Panel Rule.** Cards, the navbar, the sidebar, tables, and board lanes are flat — a `1px` Line and the canvas/panel tonal step do the separating. A soft gray drop shadow on a resting card is the 2014-app tell; delete it. The only sanctioned tiny shadow is the logo's gradient chip and true overlays.

## 5. Components

### App Shell (signature structure)
A **full-width top navbar** over a **left sidebar that starts below it**.
- **Top navbar** (`54px`, Surface, `1px` Line beneath, sticky): the logo gradient chip + "Kings Realty / USAG Humphreys" wordmark on the left; global search (⌘K), 내보내기, the **결제 기록** primary button, notifications (with a danger ping dot), and the account avatar + chevron on the right.
- **Sidebar** (`232px`, Surface, sticky below the navbar, `1px` Line on its right): labeled groups (개요 / 관리 / 정산) with 11px group captions, items showing icon + label + a muted mono count (or a danger pill for attention counts like 미납 7, AS 3), one **expandable** item (수납) revealing indented sub-rows, and a footer pinning 도움말 / 설정. Active item: `accent-weak` fill, indigo text + icon, `rounded-sm`. Collapses to a drawer on mobile (the one place the Overlay shadow + scrim apply).

### Navigation items / Tabs
- **Sidebar item:** `34px` tall, `rounded-sm`, Ink-Muted → Ink on hover (Sunken fill). Count is mono Ink-Subtle, right-aligned.
- **Work-area tabs** (목록 / 보드 / 캘린더 / 타임라인): text tabs, active gets a Sunken fill (`rounded-xs`); filter/widget controls sit at the right.

### Buttons
- **Shape:** `rounded-sm` (8px), `32px` tall (compact `28px`, large `36px`).
- **Primary:** Ink-dark fill, light text — one per view. **Outline:** Surface fill, `1px` Line, Ink text, hover Sunken. **Ghost:** transparent, hover Sunken. **Destructive:** danger text on danger-weak fill.
- **Focus:** `2px` indigo ring at ~45%, never a default outline.

### Stat Cards
White card, `1px` Line, `rounded-md`, `14–16px` padding, a header row (icon + title + optional small tools on the right). Three kinds: a **status card** (label triple + a segmented success/warning/danger bar), a **metric card** (big mono figure + a small colored delta + a sparkline), and a **trend card** (a 2-line chart with a tiny y-axis and a legend). Charts are flat SVG in accent/status colors — informative, never decorative.

### Board (kanban) + Payment Card
- **Lanes** on the Canvas, separated by `1px` Line-Soft, each with a status dot + name + mono count + an add affordance.
- **Card:** white, `1px` Line, `rounded-sm`, hover border → `accent-line`. Carries a mono ID, a colored type flag (월세/공과금/보증금/AS비), the person (bold), the property (muted), the **mono amount with currency mark**, and a footer with assignee avatar + mono date. Used for payments-by-status, and the natural view for workflow screens (AS 요청, 계약).

### Tables (list view)
- Header: Sunken fill, Label-style heads, `1px` Line beneath; numeric columns right-aligned.
- Rows: Surface, `1px` Line dividers, `~44px`, hover `accent-weak`. Selected row: `accent-weak` fill + a `2px` indigo inset marker (the one sanctioned left accent — selection only). Amounts mono, right-aligned, currency mark attached.

### Cards / Panels (summary)
`rounded-md`, `1px` Line, Surface, no shadow. A `head` row (title + optional "전체 →" link) over hairline-divided list rows. Prefer a panel over a stack of nested cards; nested cards are never right.

### Inputs / Fields
`32px`, Surface, `1px` Line, `rounded-sm`, Korean placeholder in Ink-Subtle. Focus: indigo border + `2px` indigo ring. Error: danger border + ring. Disabled: Sunken, 50% opacity.

### Badges / Status
- **Dot:** `7–8px` filled circle in the state ink, before a Korean label — the default in tables and lanes.
- **Tag:** state ink on state-weak fill, `rounded-xs`, 11–12px — for alerts and emphasis ("연체 3건").
- **Count pill:** mono; muted for informational counts, danger fill for attention (미납 7, AS 3).

## 6. Do's and Don'ts

### Do:
- **Do** set every amount, rate, count, date, and countdown in tabular monospace; right-align them in tables with the currency mark attached.
- **Do** keep panels flat on the layered canvas — `1px` Line + the Canvas/Surface tonal step, not drop shadows.
- **Do** reserve indigo for active nav, selection, focus, links, and one primary action per view (The One Voice Rule).
- **Do** use the shared four-state status vocabulary for every status — dot in tables/lanes, tag in alerts, pill for counts.
- **Do** label navigation explicitly (grouped sidebar items with counts); keep ~10px radii and compact 32px controls.
- **Do** use stat cards and light charts when they convey real operational data (collection split, trend, triage).

### Don't:
- **Don't** ship marketing-flashy decoration: no decorative gradients (the small logo chip is the only gradient), no gradient text, no hero-metric theater, no persuasion copy. (PRODUCT.md anti-reference.)
- **Don't** add toy-like or choreographed motion: no bounce, no elastic, no page-load sequences. Motion conveys state in 150–200ms or it doesn't exist. (PRODUCT.md anti-reference.)
- **Don't** put a drop shadow on a resting panel, card, navbar, sidebar, or board lane. Shadows are for transient overlays only.
- **Don't** hand-roll status colors inline (`bg-amber-50 text-amber-700`, etc.). Use the status tokens / `StatusBadge`.
- **Don't** use a colored `border-left > 1px` as decoration; the only left accent is the 2px indigo marker on a selected table row.
- **Don't** set a money figure in the proportional sans, or left-align a column of numbers.
- **Don't** drift to chroma-0 default gray or a warm cream field; the neutral is a clean cool gray (hue ~258, very low chroma — no violet cast) and the accent is indigo on purpose.
