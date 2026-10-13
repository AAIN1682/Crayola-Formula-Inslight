# Pre-check rule-based scoring plan (Stage 4 — plan only)

Source UX: `docs/preseal-prototype.html` — `screen()`, `verdictSentence()`, `BASE_SCORE` 95, bands ≥80 AP / ≥50 at risk / &lt;50 CL, issue penalties, `RANK` worst-wins per check.

## Engine

- **Module:** `backend/app/preseal_screen.py` — pure function `screen_formula(formula, catalog, evidence, options) -> PresealScreenResult`.
- **No demo LIB flags.** Every limit, check status, and issue must cite real `rule_id`, region, file pointer from `load_catalog()` / `us_ 2.json` / `eu_ 2.json` / `substance_roles.json` and uploaded evidence metadata only.
- **Output shape:** `{ score, band, band_label, confidence, checks[], issues[], fixes[], gaps[], exposure[], verdict_sentence, disclaimer }` matching prototype views but with `source_ids[]` on each check/issue.

## Weights

- **File:** `backend/app/preseal_weights.json` — comment: *Heuristic weights taken from the prototype. They must be reviewed by a toxicologist before use.*
- Initial penalties (prototype): composition not 100% 10; soluble metal data missing 6; CoA missing 5; SDS missing 3; sensitizer above limit 26; talc cert missing 25; dust test missing 18; borax/fragrance undisclosed 40; base 95; clamp score 5–97.

## Ten checks → real data mapping

| Check | Real inputs |
|-------|-------------|
| Full composition 100% | `validate_threshold_formula` / declared + legacy totals; fail if ≠100%. |
| Lead (CPSIA) | US `us_ 2.json` soluble/content rules for category/age; `calculated_checks` pass/fail. |
| Soluble heavy metals (ASTM F963) | US/EU migration/soluble rules in threshold catalog for pigments/metals; lab `calculated_checks`. |
| CMR / Prop 65 / CLP flagged substances | Matching substance rows + reference rows; only if present in catalog for scope. |
| Skin sensitizers | Preservative/MIT/etc. rows in US/EU files when ingredient matches catalog id. |
| Fragrance allergens | Only if fragrance/allergen rows exist for scope; else N/A. |
| Inhalable dust (ASTM D4236) | Dry forms (`physical_form` powder/solid stick) + silica/dust-related rows if any; else N/A for liquids. |
| Levels accepted in past reviews | `documented_history` / `historical_cases` — today empty → **N/A**, detail *No review history in the dataset*. |
| Intentionally added PFAS | PFAS rows in catalog if any for category; else N/A. |
| Supplier documents (SDS/CoA) | `evidence_checks` missing/mismatched from engine — data gap, not pass. |

**Worst status wins per check:** N/A &lt; pass &lt; data gap &lt; fail (same as prototype `RANK`).

**No rule in catalog for product scope:** check status **`not_applicable`** with detail *No rule in catalog for this product scope* — never assume pass.

**Stronger engine result wins:** if `calculated_checks` has `fail`, score/band cannot look better than that failure (cap band/score using open failed checks).

## UI label

- Show **Pre-check score (rule-based)** with disclaimer from backend (`coverage_note` / assessment limitations).
- **`preliminary_prediction.numeric_estimate`** from Azure stays separate, labeled as uncalibrated model estimate (not mixed into rule score bar).

## Now vs With selected fixes

- User selects fix checkboxes (reformulate / lab test / supplier request).
- Clone formula dict, apply fix `apply` patches (concentration change, flags like `labData` only when evidence model supports it).
- Re-run **`screen_formula`** on patched copy; display Now vs With fixes — no hand subtraction.

## Confidence

- High/Medium/Low from count of similar past decisions (≥10 / 5–9 / &lt;5). **`historical_cases` empty** → Low, *No past decisions on file*.

## Exposure view

- Only where catalog/evidence exposes real dose/MOS data; else *No safety data* per ingredient — no invented margins.

## Test ingredients (8) — expected check applicability today

| Ingredient | Catalog rule today | Pre-check expectation |
|------------|-------------------|------------------------|
| Water 7732-18-5 | None in US/EU threshold JSON | N/A / data gap (no rule) |
| Glycerin 56-81-5 | None | N/A |
| Tartrazine 1934-21-0 | None | N/A |
| Sodium Benzoate 532-32-1 | US preservative 0.5% (pending verification) | Rule check + source review gap |
| Gypsum 10101-41-4 | None | N/A |
| Starch Gum 9005-25-8 | None | N/A |
| Fine Grade Talc 14807-96-6 | None by CAS; EU *Talc (unpurified)* uncorrelated | N/A unless toxicologist links identity |
| Copper Powder / Cu 7440-50-8 | EU Cu migration (contaminant analyte) | Lab analyte check if declared as contaminant; not ordinary filler pass |

## Frontend

- Display `PresealScreenResult` on results page; fix plan checkboxes call re-run endpoint or client-side re-screen with patched payload.
