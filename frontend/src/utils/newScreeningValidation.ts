import type { CompositionRow, NewScreeningDraft } from '../types/newScreening';
import { compositionIsComplete, parsePercent } from './compositionMath';
import { formulationCompositionTotal } from './formulationComposition';

/** Reasons for disabling Run pre-check (tooltips / screen readers only — not shown inline). */
export function runPrecheckBlockers(draft: NewScreeningDraft): string[] {
  const reasons: string[] = [];
  if (!draft.name.trim()) reasons.push('Enter a product name.');
  if (!draft.targetMarkets.length) reasons.push('Choose at least one market.');
  const total = formulationCompositionTotal(draft.ingredients);
  if (!compositionIsComplete(total)) {
    reasons.push(`Total is ${total.toFixed(1)}%, needs 100%.`);
  }
  draft.ingredients.forEach((row, index) => {
    const label = `Ingredient ${index + 1}`;
    if (row.custom && !row.name.trim()) {
      reasons.push(`${label}: enter a custom ingredient name.`);
      return;
    }
    const named = row.catalogId || row.name.trim();
    if (!named) return;
    if (!row.custom && !row.catalogId) {
      reasons.push(`${label}: select an ingredient from the list.`);
    }
    const pct = parsePercent(row.pct);
    if (!Number.isFinite(pct) || pct <= 0) {
      reasons.push(`${label}: enter a percentage above 0.`);
    }
  });
  return reasons;
}

export function draftSaveRows(draft: NewScreeningDraft): CompositionRow[] {
  return draft.ingredients.filter((row) => row.catalogId || row.name.trim());
}

export function hasNamedIngredient(row: CompositionRow): boolean {
  return Boolean(row.catalogId || row.name.trim());
}
