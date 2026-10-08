/**
 * Reference ingredient catalog helpers.
 * Source of truth: repository `data/ingredients.json` served at GET /api/ingredients.
 */

import bundledReference from '../../../data/ingredients.json';

export interface IngredientCatalogEntry {
  id: string;
  name: string;
  casNumber: string;
}

export interface ReferenceCatalogIngredient {
  ingredient_id: string;
  name: string;
  cas_number?: string;
  functional_role?: string;
}

export function mapReferenceCatalogIngredients(items: ReferenceCatalogIngredient[]): IngredientCatalogEntry[] {
  return items.map((item) => ({
    id: item.ingredient_id,
    name: item.name,
    casNumber: item.cas_number?.trim() ?? '',
  }));
}

/** Used when `/api/ingredients` is unavailable (e.g. production static build). */
export const FALLBACK_REFERENCE_CATALOG: IngredientCatalogEntry[] = mapReferenceCatalogIngredients(
  bundledReference as ReferenceCatalogIngredient[],
);

export function formatIngredientCatalogLabel(entry: IngredientCatalogEntry): string {
  return entry.name;
}

export const INGREDIENT_CATALOG_QUICK_PICK_COUNT = 12;

export function quickPickIngredientCatalog(catalog: IngredientCatalogEntry[]): IngredientCatalogEntry[] {
  return catalog.slice(0, INGREDIENT_CATALOG_QUICK_PICK_COUNT);
}

export function searchIngredientCatalog(
  catalog: IngredientCatalogEntry[],
  query: string,
): IngredientCatalogEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return quickPickIngredientCatalog(catalog);
  return catalog.filter(
    (entry) =>
      entry.name.toLowerCase().includes(normalized) ||
      entry.id.toLowerCase().includes(normalized) ||
      entry.casNumber.includes(normalized),
  );
}

export function findIngredientCatalogEntryById(
  catalog: IngredientCatalogEntry[],
  id: string,
): IngredientCatalogEntry | undefined {
  if (!id) return undefined;
  return catalog.find((entry) => entry.id === id);
}

export function findIngredientCatalogEntry(
  catalog: IngredientCatalogEntry[],
  name: string,
): IngredientCatalogEntry | undefined {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return undefined;
  return catalog.find((entry) => entry.name.toLowerCase() === trimmed);
}
