/**
 * Approved ingredient names and CAS numbers for the formula builder.
 *
 * This mirrors the shape of a future backend catalog (e.g. GET /api/ingredient-catalog
 * or backend/data/ingredient-catalog.json). Do not add that JSON on the server until
 * product supplies the PDF-derived list; swap the loader here when the API exists.
 */

export interface IngredientCatalogEntry {
  id: string;
  name: string;
  casNumber: string;
}

export const INGREDIENT_CATALOG: IngredientCatalogEntry[] = [
  { id: 'ING-001', name: 'Aqua Base Concentrate', casNumber: '7732-18-5' },
  { id: 'ING-002', name: 'Polyol Humectant HX-2', casNumber: '57-55-6' },
  { id: 'ING-003', name: 'Cyan Dispersion Pigment C-14', casNumber: '13463-67-7' },
  { id: 'ING-004', name: 'Magenta Dispersion Pigment M-21', casNumber: '13463-67-7' },
  { id: 'ING-005', name: 'Yellow Dispersion Pigment Y-09', casNumber: '13463-67-7' },
  { id: 'ING-006', name: 'Carbon Dispersion Black K-02', casNumber: '1333-86-4' },
  { id: 'ING-007', name: 'Acrylic Binder Emulsion AB-30', casNumber: '9003-01-4' },
  { id: 'ING-008', name: 'Vinyl Acetate Copolymer VC-11', casNumber: '9003-20-7' },
  { id: 'ING-009', name: 'Nonionic Surfactant NS-7', casNumber: '68439-46-3' },
  { id: 'ING-010', name: 'Preservative Blend PB-3', casNumber: '2634-33-5' },
  { id: 'ING-011', name: 'Cellulose Thickener T-12', casNumber: '9004-34-6' },
  { id: 'ING-012', name: 'Glycerin Softener GL-2', casNumber: '56-81-5' },
  { id: 'ING-013', name: 'Preservative Blend PB-9 (legacy)', casNumber: '2634-33-5' },
  { id: 'ING-014', name: 'Calcium Carbonate Filler F-55', casNumber: '471-34-1' },
  { id: 'ING-015', name: 'Paraffin Wax Grade W-18', casNumber: '8002-74-2' },
  { id: 'ING-016', name: 'Stearate Processing Aid SA-4', casNumber: '557-05-1' },
  { id: 'ING-017', name: 'Food-Grade Starch Base S-30', casNumber: '9005-25-8' },
  { id: 'ING-018', name: 'Mineral Oil Conditioner MO-6', casNumber: '8042-47-5' },
  { id: 'ING-019', name: 'Sodium Chloride Grade NC-1', casNumber: '7647-14-5' },
  { id: 'ING-020', name: 'Citric Acid pH Adjuster PA-8', casNumber: '77-92-9' },
];

const byName = new Map(INGREDIENT_CATALOG.map((entry) => [entry.name.toLowerCase(), entry]));
const byId = new Map(INGREDIENT_CATALOG.map((entry) => [entry.id, entry]));

export function findIngredientCatalogEntry(name: string): IngredientCatalogEntry | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return byName.get(trimmed.toLowerCase());
}

export function findIngredientCatalogEntryById(id: string): IngredientCatalogEntry | undefined {
  if (!id) return undefined;
  return byId.get(id);
}

export function formatIngredientCatalogLabel(entry: IngredientCatalogEntry): string {
  return entry.name;
}

/** Shown when the dropdown opens before the user runs a search. */
export const INGREDIENT_CATALOG_QUICK_PICK_COUNT = 12;

export function quickPickIngredientCatalog(): IngredientCatalogEntry[] {
  return INGREDIENT_CATALOG.slice(0, INGREDIENT_CATALOG_QUICK_PICK_COUNT);
}

export function searchIngredientCatalog(query: string): IngredientCatalogEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return quickPickIngredientCatalog();
  return INGREDIENT_CATALOG.filter(
    (entry) =>
      entry.name.toLowerCase().includes(normalized) ||
      entry.id.toLowerCase().includes(normalized) ||
      entry.casNumber.includes(normalized),
  );
}
