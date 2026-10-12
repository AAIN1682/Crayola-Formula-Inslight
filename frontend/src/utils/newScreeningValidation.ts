import type { CompositionRow, NewScreeningDraft } from '../types/newScreening';
import { compositionMeterMessage, parsePercent } from './compositionMath';
import { formulationCompositionTotal } from './formulationComposition';

export function runPrecheckBlockers(draft: NewScreeningDraft): string[] {
  const reasons: string[] = [];
  if (!draft.name.trim()) reasons.push('Enter a product name.');
  if (!draft.targetMarkets.length) reasons.push('Choose at least one market.');
  const total = formulationCompositionTotal(draft.ingredients);
  const meter = compositionMeterMessage(total);
  if (!meter.ok) {
    reasons.push(meter.message.replace('The template needs exactly 100%. ', 'Total is not 100%. '));
  }
  draft.ingredients.forEach((row, index) => {
    const label = `Ingredient ${index + 1}`;
    if (row.custom && !row.name.trim()) {
      reasons.push(`${label} is not in the catalog — enter a name or pick from the catalog.`);
      return;
    }
    const named = row.catalogId || row.name.trim();
    if (!named) return;
    if (!row.custom && !row.catalogId) {
      reasons.push(`${label} — select an ingredient from the catalog.`);
    }
    const pct = parsePercent(row.pct);
    if (!Number.isFinite(pct) || pct <= 0) {
      reasons.push(`${label} needs a % greater than 0.`);
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
