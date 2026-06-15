# Product

## Register

product

## Users

Kings Realty staff in South Korea, with `admin` and `staff` roles (better-auth admin plugin). Korean-speaking. They run the day-to-day operations of a real-estate business that rents 100+ properties to US military officers and soldiers around USAG Humphreys.

Primary context is **desktop-first power use**: at a desk, on a large screen, mostly keyboard and mouse, doing repetitive data entry and lookups. Secondary context is **phone/tablet in the field**, while visiting properties or sitting with tenants, so core flows must stay usable on small screens.

The job to be done: track landlords, properties, tenants, families, and leases; record rent and utility payments in USD or KRW using a daily exchange rate; pay landlords and utility companies on tenants' behalf; log and escalate maintenance/service requests; keep the accounting ledger; and generate receipts and lease PDFs. The recurring question on any screen is "what's owed, what's paid, what's overdue, and who do I act on next."

## Product Purpose

An internal operations system for a Korean real-estate business serving US military tenants. It replaces spreadsheets and scattered records with one source of truth for properties, people, money, and maintenance. It exists because the business handles cash flow in two currencies (collecting from tenants without Korean bank accounts, paying Korean landlords and utility companies) and cannot afford ambiguity about who paid what, at what rate, on which day.

Success looks like: a staff member can record a payment, find a tenant or lease, or see exactly what is overdue in seconds, with every figure unambiguous across KRW and USD and every legal/financial action accurately logged.

## Brand Personality

Sharp and professional. Crisp, modern, businesslike, with confident defaults and no clutter. Quietly serious, because the tool moves money and tracks legal leases: it should read as reliable and exact, never decorative. Voice is Korean, plain and direct, the language of an operator who knows the domain (계약, 미납, 수납, 보증금, DEROS), not marketing copy.

## Anti-references

- **Flashy consumer SaaS.** No marketing gradients, gradient text, hero-metric templates, decorative illustrations, or persuasion-shaped copy. This is a working tool, not a landing page.
- **Over-animated / toy-like.** No bouncy or elastic motion, no cutesy elements, no gratuitous transitions. Motion only when it communicates state.
- (Implicitly also the opposite failure: dated, cluttered enterprise/government software. Density is fine; ugliness and disorder are not.)

## Design Principles

1. **Density is a feature.** Staff scan, compare, and act all day. Every screen earns its space and surfaces what matters at a glance; primary information should not require scrolling. Compactness serves the power user, it is not crowding.
2. **Accuracy you can trust.** Money and dates are never ambiguous. Always show currency explicitly, use tabular figures for anything numeric, attach the exchange rate to the amount, and confirm before irreversible or financial actions. The interface's job is to prevent costly mistakes.
3. **The tool disappears.** Earned familiarity over novelty. Use standard affordances, the same component vocabulary screen to screen, and conventional navigation. No invented controls for ordinary tasks; the staff member should think about the work, not the UI.
4. **Fast on desktop, usable in the field.** Optimize the dense desktop workflow first, then make sure it degrades gracefully to phone and tablet for property visits. Responsiveness is structural (collapsing nav, responsive tables), not shrinking type.
5. **Restraint over decoration.** Color and motion convey state (overdue, pending, paid, selected, error), never ornament. When in doubt, remove it.

## Accessibility & Inclusion

- **Korean-first.** UI is Korean only (`<html lang="ko">`), set in Pretendard for Korean legibility. Copy uses the domain's real terms.
- **Contrast target WCAG AA.** Body text ≥ 4.5:1, large/bold text ≥ 3:1, including the muted-foreground used heavily for secondary labels and the very small (10–12px) text in the dashboard. Treat the stock neutral muted gray as a watch item; bump toward ink wherever it carries real information.
- **Light and dark both supported** (next-themes, system default). Both themes must meet contrast and state-color requirements; the semantic alert colors (orange/amber/blue) need dark-mode variants that stay legible.
- **Reduced motion respected.** Given the restraint principle there is little motion to begin with; any transition added must have a `prefers-reduced-motion: reduce` fallback.
- **Legible defaults for mixed eyesight.** Avoid sub-12px text for anything a user must read to act; reserve the smallest sizes for incidental labels. Keep tap targets usable for the field/phone context.
