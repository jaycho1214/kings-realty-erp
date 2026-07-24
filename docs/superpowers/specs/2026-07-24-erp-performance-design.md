# ERP 성능 개선 — Design

**Date:** 2026-07-24
**Status:** Approved for implementation
**Trigger:** Staff feedback that the ERP is "too slow." Symptom reported as *UI feels laggy* (typing lag, stuttering dialog animations) on **weak-but-modern Windows 10/11 desks** — not "waiting for pages to load."

---

## 1. Problem

The complaint is CPU/GPU-bound rendering on the client, not server or network latency. Staff describe:

1. Input lag while typing in the tenant roster search.
2. Stuttering animation when dialogs open.

The app already runs in Vercel's `icn1` (Seoul) region with a pooled `pg` connection, so the server side is not the reported bottleneck. This spec targets the client.

### Measured evidence

Collected from a production build (`pnpm build`) on 2026-07-24:

| Metric | Value |
|---|---|
| Client JS on **every** page (7 root chunks) | **447 KB raw** |
| Total client JS across all chunks | 2.6 MB raw |
| Components marked `"use client"` | **114 of 178 (64%)** |
| `<Suspense>` boundaries in `src/` | **0** |
| `prefers-reduced-motion` handling | **0 occurrences** |
| SunEditor (455 KB chunk) | already lazy via `next/dynamic` ✅ |
| Next.js `reactCompiler` | not enabled |

### Root causes identified

**A. Full-viewport `backdrop-filter` on every overlay.**
`src/components/ui/dialog.tsx:34`, `src/components/ui/alert-dialog.tsx:33`, and `src/components/ui/sheet.tsx:31` each apply `supports-backdrop-filter:backdrop-blur-xs` to a `fixed inset-0` element. This forces the compositor to snapshot the entire viewport, run a blur shader over it, and re-composite — repeated every frame while the fade animation runs. On the Intel integrated graphics typical of these machines this is among the most expensive operations available.

The blur is `backdrop-blur-xs` (**2px**) sitting behind a `bg-black/10` scrim, i.e. visually negligible. The cost buys nothing on any machine.

**B. Heavy dialog bodies mount in the same frame the animation starts.**
No `keepMounted` or `forceMount` exists anywhere, so Base UI mounts dialog content on open. The main thread mounts and hydrates a large client component while the zoom/fade is trying to run, dropping frames.

| Dialog body | Lines |
|---|---|
| `payments/new/_components/payment-collector.tsx` | 1026 |
| `calendar/_components/create-event-dialog.tsx` | 585 |
| `services/_components/service-form.tsx` | 576 |
| `tenants/_components/tenant-form.tsx` | 461 |
| `components/layout/edit-profile-dialog.tsx` | 404 |
| `(dashboard)/_components/task-dialog.tsx` | 379 |

**C. Unmemoized roster filtering on every keystroke.**
`src/app/(dashboard)/tenants/_components/tenant-rail.tsx:56`:

```tsx
const rows = filterRoster(tenants, q, view);   // runs on every render
```

`src/lib/tenant-roster.ts` documents the roster as **~150–300 rows**. Per keystroke `filterRoster` performs two full array passes, a `toLowerCase()` per row, and a `digits()` regex per phone number — then React re-creates and reconciles 150–300 row elements. There is no `useMemo`, no `useDeferredValue`, and no virtualization. This is the most-used screen in the product.

**D. `transition-all` on base components.**
`button.tsx:9`, `badge.tsx:8`, `tabs.tsx:67`, `navigation-menu.tsx:74,117`, `sidebar.tsx:292`. `transition-all` makes the browser watch every animatable property for changes. In a dense table with hundreds of buttons and badges this inflates every style recalculation.

**E. Structural client-side weight.** 64% client components and a 447 KB per-page baseline mean significant parse, execute, and hydrate work on every navigation.

**F. Server waterfalls (secondary).** `(dashboard)/layout.tsx:27` issues 7 count queries on every navigation into the dashboard group. `tenants/layout.tsx:25` reloads the entire roster on every tenant click. Not the reported symptom, but wasteful.

---

## 2. Non-goals

**Electron is rejected.** Electron *is* Chromium — the same renderer, the same React hydration, the same compositor that makes cause (A) slow — plus a Node process and ~200–300 MB baseline RAM before the app draws a pixel. On 4–8 GB machines it means running a second browser beside the one already open. It addresses none of the causes above and worsens memory pressure. (Electron also dropped Windows 7/8 support in v23, though that is moot here.)

**A user-facing "low PC mode" toggle is deferred** — see §8. Causes A–D are *waste*, not tradeoffs: no machine benefits from an invisible blur or an unmemoized filter. Making them configurable would preserve a slow path permanently, double the testing surface, and ship a settings screen whose purpose is opting out of a defect. A runtime flag also cannot reach cause (E), since that JS is downloaded and executed before any preference is read.

**No unrelated refactoring.** Changes stay scoped to the causes above.

---

## 3. Stage 0 — Delete expensive paint

Lowest risk, highest immediate payoff. Nothing is lost visually on any machine.

1. **Remove `supports-backdrop-filter:backdrop-blur-xs`** from all three overlays (`dialog.tsx:34`, `alert-dialog.tsx:33`, `sheet.tsx:31`). Keep `bg-black/10` and keep the fade — `opacity` and `transform` are compositor-friendly and effectively free.
2. **Narrow `transition-all` → `transition-colors`** (or an explicit property list) in `button.tsx`, `badge.tsx`, `tabs.tsx`, `navigation-menu.tsx`, and `sidebar.tsx`. Where a transform or shadow genuinely animates, name those properties explicitly rather than reverting to `all`.
3. **Audit the one remaining `backdrop-blur`** at `inspections/[inspectionId]/_editor.tsx:435`. It is a sticky footer bar, not full-viewport, so it is far cheaper — replace with an opaque background only if it measures as a problem.

**Success:** dialogs open without visible stutter on a representative staff machine. No perceptible visual difference on a fast machine.

---

## 4. Stage 0.5 — Honor `prefers-reduced-motion`

This is the project's "low PC mode," obtained for free through a web standard.

`PRODUCT.md` already requires it:

> "Reduced motion respected... any transition added must have a `prefers-reduced-motion: reduce` fallback"

Currently implemented in **zero** places. This stage closes a documented accessibility gap and simultaneously gives struggling machines a fast path.

Add a global reduce block to `src/app/globals.css` (which already imports `tailwindcss` and `tw-animate-css`):

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Why this beats a custom toggle:**

- **OS-level.** Windows → Settings → Accessibility → Visual effects → Animation effects. Staff on struggling machines have often already disabled this, so they get the fast path with no action and no training.
- **No discovery problem.** A toggle buried in settings is found by the people least likely to need it.
- **No new infrastructure.** The schema currently has no per-user preference storage; a toggle would require DB state, a settings UI, and ongoing support burden.

**Success:** enabling "Animation effects off" in Windows makes all dialog/sheet transitions instant.

---

## 5. Stage 1 — Unblock the main thread

1. **Enable the React Compiler.** In `apps/crm/next.config.ts` set `reactCompiler: true`. Stable in Next.js 16 but off by default; it auto-memoizes components and removes a broad class of re-render waste without code churn. Requires `babel-plugin-react-compiler` and raises build times — verify the build still passes and measure before/after.
2. **Fix the tenant rail** (`tenant-rail.tsx:56`): wrap `filterRoster` in `useMemo`, drive it from a `useDeferredValue` copy of the query so keystrokes stay responsive, and virtualize the row list so only visible rows render. Keep `filterRoster` itself pure and unit-tested (`src/lib/tenant-roster.test.ts` already exists).
3. **Audit other filter-on-keystroke lists** for the same pattern.
4. **Split the large dialog bodies** so opening a dialog does not mount ~1000 lines synchronously. Prefer lazy-loading the body via `next/dynamic` and/or decomposing multi-step forms so only the active step mounts.

**Success:** typing in the roster search stays responsive under 6× CPU throttling.

---

## 6. Stage 2 — Cut the hydration baseline

Reduce the 447 KB per-page baseline and the 114 client components.

Approach: for each large client component, keep only the **interactive leaf** as `"use client"` and move data/row rendering back to server components, passing rendered rows through as `children`. Many components are currently client-only because of a single `onClick` or a dialog trigger.

Prioritize by usage: tenants, payments, properties.

**Success:** a measurable reduction in baseline raw JS and in Total Blocking Time. Set the concrete target after Stage 1 measurements, since the React Compiler changes the baseline.

---

## 7. Stage 3 — Server waterfalls (secondary)

Not the reported symptom; do only if measurements justify it.

1. Add `<Suspense>` boundaries so dense screens stream rather than blocking on all data.
2. Trim the 7 count queries in `(dashboard)/layout.tsx:27` — combine into a single query or cache them.
3. Avoid reloading the full roster on every tenant navigation (`tenants/layout.tsx:25`).

---

## 8. Stage 4 — Configurable mode (contingency, not scheduled)

If the worst machines remain slow after Stages 0–2, revisit a user preference — but only for **genuine tradeoffs**, where the user gives up real functionality for speed:

- suppressing tenant photos / avatars
- smaller page sizes
- disabling background refresh

This stage is deliberately not scheduled. The decision to build it must be based on measurements taken *after* the waste is removed.

---

## 9. Verification

Measurement is per-stage and must precede any claim of improvement.

- **Baseline first.** Chrome DevTools Performance trace with **6× CPU throttling** to approximate the staff hardware, recording (a) opening 수납 등록, (b) typing 5 characters into the roster search. Capture Total Blocking Time and dropped frames.
- **Re-measure identically after each stage.** Compare against the recorded baseline, not against impressions.
- **Build-size check** after Stages 1 and 2: re-run `pnpm build` and re-measure root chunk bytes.
- **Regression safety:** `pnpm --filter crm test` must stay green; `filterRoster` behavior is covered by `src/lib/tenant-roster.test.ts` and must not change semantically.
- **Ship Stage 0 + 0.5 to staff first** and confirm the dialog complaint disappears before committing to Stages 1–2. Staff confirmation is the acceptance signal, not synthetic numbers alone.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| React Compiler changes runtime behavior in a subtly wrong component | Enable in isolation, run the test suite, exercise the heaviest screens manually before shipping |
| React Compiler raises build times | Measure; the Rust port (`experimental.turbopackRustReactCompiler`) is an option if Babel is too slow |
| Virtualizing the rail breaks keyboard navigation or Cmd-K search integration | Verify roster keyboard flow and existing `cmdk` search after the change |
| Stage 2 server-component migration is broad and regression-prone | Migrate incrementally, one route at a time, highest-traffic first |
| Removing blur is perceived as a visual downgrade | It is a 2px blur behind a 10% scrim; confirm with a side-by-side screenshot before/after |
