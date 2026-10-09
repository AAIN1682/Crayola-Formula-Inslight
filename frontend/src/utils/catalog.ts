import type { Formula, Ingredient } from '../types/domain';
import type { CatalogMaterial } from '../api/formulaBackend';

export function catalogIdSet(materials: CatalogMaterial[]): Set<string> {
  return new Set(materials.map((item) => item.material_id));
}

export function isCatalogMaterialId(id: string | undefined, catalogIds: Set<string>): boolean {
  return Boolean(id && catalogIds.has(id));
}

export function unresolvedIngredients(formula: Formula, catalogIds: Set<string>): Ingredient[] {
  return formula.ingredients.filter((ingredient) => !isCatalogMaterialId(ingredient.rawMaterialId, catalogIds));
}

export function usesBackendCatalog(formula: Formula, catalogIds: Set<string>): boolean {
  return formula.ingredients.length > 0 && unresolvedIngredients(formula, catalogIds).length === 0;
}

export function identityErrorMessage(unresolved: Ingredient[]): string {
  const labels = unresolved.map((item) => item.name || item.rawMaterialId || 'unnamed ingredient').join(', ');
  return (
    `Resolve ingredient identity before running a completed assessment: ${labels}. ` +
    'Open Edit formula and select the correct catalog material for each row, then run again. ' +
    'Legacy IDs are not mapped by name similarity.'
  );
}

export function isUnresolvedIdentityError(message: string | undefined): boolean {
  return Boolean(message && /resolve ingredient identity/i.test(message));
}
