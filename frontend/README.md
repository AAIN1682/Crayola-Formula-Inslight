# Formula Insight

**Affine Analytics — Formula Insight v1.0**
Workspace: **Crayola · Product Safety** · *Demo workspace · Synthetic data*

A front-end application that helps Crayola formulation, product safety, regulatory and R&D
teams screen product formulas internally before anything is prepared for Duke's ACMI review.

Everything in this application is **synthetic and illustrative**. There is no backend, no
database, no LLM, no authentication and no connection to any regulatory, supplier or safety
source. Formulas, raw materials, documents, thresholds, findings and historical outcomes are
invented for demonstration.

---

## Running it

```bash
npm install
npm run dev     # http://localhost:5173
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check then produce a production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite (58 tests) |

Stack: React 19, TypeScript, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), React Router 7,
lucide-react, Recharts. No external image or font assets — every graphic is inline SVG or CSS.

---

## The three statuses, and why they are kept apart

The application deliberately separates three different things that are easy to conflate:

| | What it is | Where it lives |
| --- | --- | --- |
| **Screening status** (Green / Amber / Red) | Internal result of the illustrative demo rule checks in this workspace | Formula library, formula details, screening results |
| **Review status** | Internal decision recorded by the product safety team | Formula library, formula details |
| **Recorded outcome** (AP / CL / More Data Needed) | Historical result of a past *external* submission in the synthetic dataset | Submission History |

A Green screening result is never presented as an AP certification, an ACMI review outcome, or
a guarantee of acceptance. No acceptance probability is calculated anywhere.

---

## What the screening engine actually does

`src/utils/screening.ts` is a small, deterministic, fully readable rule engine. It models no
toxicology and performs no regulatory evaluation.

**Demo rules**

| Rule | Check | Severity |
| --- | --- | --- |
| DR-01 | Material flagged for expert assessment | High |
| DR-02 | Concentration above the material's illustrative demo ceiling | High above 1.5×, otherwise Medium |
| DR-03 | Ingredient not linked to the raw-material catalog | Medium |
| DR-04 | A required supporting document is not on file | Medium |
| DR-05 | A required supporting document is marked outdated | Medium |
| DR-06 | Ingredient new in the current version with no documents | Medium |
| DR-07 | Composition total outside the ±0.5% rounding tolerance | Medium |
| DR-08 | Preservative system present (informational) | Info |
| DR-09 | No formula-level evidence linked | Low |

**Status**

- **Red** — at least one high-severity finding.
- **Amber** — no high-severity finding, but a medium finding, a missing/outdated required
  document, or an exposure input that is not assessed.
- **Green** — none of the above, and every required supporting document is on file.

Missing required evidence therefore cannot produce Green, by construction.

**Required evidence** is derived per ingredient from its raw material: an SDS always; a
certificate of analysis for colorants, opacifiers, preservatives and deterrent additives; a
laboratory report where the material is flagged for one.

**Exposure readiness** lists the inputs an assessment would need. Inputs populated from a
category default are labelled *"Illustrative demo fixture — not a validated safety
calculation"*. Anything absent reads **Not assessed**.

**Historical comparisons** show a *Demo ingredient-overlap score* — shared raw materials ÷
distinct raw materials across both records — with the arithmetic exposed in a tooltip. It
describes composition overlap only, and the UI states that historical acceptance does not
establish acceptance of a modified formula.

---

## Architecture

```
src/
  app/            App, route configuration, provider composition
  layouts/        AppShell, Sidebar, TopBar (breadcrumbs, search, notifications, user menu)
  pages/          One file per screen; formula tabs live in pages/formula-tabs/
  components/
    ui/           Buttons, badges, tables, drawers, modals, toasts, filters, stepper…
    charts/       Recharts wrappers, each with a text summary
    graphics/     Hand-built SVG (molecular network, brand mark, empty states)
    formulas/     Multi-step formula form, comparison view
    screening/    Run dialog, findings, exposure readiness, comparisons, reviewer actions
    evidence/     Document preview drawer, local attachment control
    monitoring/   Alert drawer, upcoming-review timeline
  types/          domain.ts (entities) · services.ts (filters, DTOs, view models)
  services/       contracts.ts (the interface) · index.ts (entry point) · mock/ (local impl)
  data/           seed.ts (synthetic dataset) · documents.ts (document previews)
  state/          DemoDataProvider · reducer · store · persistence
  utils/          screening · validation · filtering · export · formatting · ids · cn
  styles/         index.css (Tailwind v4 theme tokens)
```

**Data flow.** A reducer-backed store (`state/store.ts`) holds the whole dataset. React reads
it through `useSyncExternalStore`, so reads are synchronous and every screen stays consistent
after an action. `services/index.ts` is the single place the implementation is chosen:

```ts
export function createServices(store: DemoStore): FormulaInsightServices {
  return createMockServices(store);
}
```

Pages and components depend only on the `FormulaInsightServices` interface
(`listFormulas`, `getFormula`, `createFormula`, `updateFormula`, `runScreening`,
`getScreeningResult`, `saveReviewDecision`, `listSubmissions`, `compareFormulas`,
`listMonitoringAlerts`, `updateMonitoringAlert`, `listRawMaterials`, `getDashboardSummary`
and friends). Swapping in an HTTP implementation means replacing that one factory — no page
imports the mock, and nothing outside `state/persistence.ts` touches `localStorage`.

**Persistence.** The dataset is written to `localStorage` under `formula-insight.dataset` in a
versioned envelope. Absent, unreadable, outdated or structurally invalid payloads fall back to
a fresh seed. **Settings → Reset demo data** restores the original seed.

---

## The seeded dataset

18 formulas across markers, paints, crayons, modeling compounds and glue; 25 raw materials;
12 historical submissions; 8 monitoring alerts; plus documents, review notes and activity.

Screening runs in the seed are produced by the same engine the app uses at runtime, so the
stored statuses are always consistent with the rules (a test asserts this).

Scenarios worth opening:

| Scenario | Where |
| --- | --- |
| Complete formula, Green result | `ColorFlow Washable Marker` (FML-1001) |
| Missing supplier evidence → Amber | `ColorFlow Ultra Washable Marker` (FML-1002) |
| Seeded high-priority concern → Red | `SoftShape Modeling Compound` (FML-1005) |
| Concentration far above the demo ceiling → Red | `SureBond Glitter Glue` (FML-1015) |
| New ingredient with no supporting evidence | `SoftShape Scented Modeling Compound` (FML-1006) |
| Revised formula with an outdated screening result | `ColorFlow Fine Line Marker` (FML-1011) |
| Historically accepted formula due for reassessment | `SureBond School Glue` (FML-1009) |
| Draft with an unlinked ingredient | `AquaTone Watercolor Set` (FML-1012) |

A good two-minute walkthrough: open FML-1002 → **Evidence** → record a local file against the
outstanding certificate of analysis → **Run Screening** → watch Amber become Green → record a
review decision → check the Overview totals and the formula's Activity tab.

---

## Attachments

Selecting a file records only its **name, size and type**, in this browser. The file is never
read, uploaded or analyzed, and every attachment is labelled *"Local demo attachment — content
not analyzed"*. Recording a document satisfies the demo check that a document of that type
exists; it says nothing about the document's contents. Because the evidence picture changed,
any screened formula using that material is marked outdated until screening runs again.

---

## Accessibility and interaction

Every visible control works. Search, filtering, sorting, pagination, tabs, drawers, dialogs,
form validation, loading/empty/error states with retry, toast confirmations, confirmation
dialogs for archive and reset, real CSV and JSON downloads, and a print-friendly result
summary are all implemented. Asynchronous actions are guarded against double submission.

Dialogs have accessible labels, managed initial focus, a focus trap, Escape-to-close and focus
restoration; nested dialogs use a stack so only the topmost one handles keys. Tables use
semantic markup with `aria-sort` on sortable headers. Colour is always paired with text and an
icon. Charts carry text summaries, and short transitions honour
`prefers-reduced-motion`.

---

## Tests

`npm test` runs 58 tests:

- `src/utils/validation.test.ts` — concentration totals, the ±0.5% tolerance, required fields.
- `src/utils/screening.test.ts` — Green/Amber/Red rules, "missing evidence can never be Green",
  determinism, result invalidation, and seed-dataset consistency.
- `src/services/services.test.ts` — create/duplicate/archive, the five screening stages,
  evidence recorded → Amber becomes Green, edits invalidating a run, review decisions,
  monitoring counts, dashboard derivation, and demo reset.
- `src/app/App.test.tsx` — mounts the real route tree in jsdom and walks every primary screen.
