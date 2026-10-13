import type { CatalogOption } from '../hooks/useCatalogMaterials';

export interface DemoScreeningIngredient {
  name: string;
  cas: string;
  functionLabel: string;
  source: 'demo-list';
}

export function normalizeCasKey(cas: string): string | null {
  const trimmed = cas.trim();
  if (!trimmed || trimmed === '-' || /^undisclosed$/i.test(trimmed)) return null;
  return trimmed.toLowerCase().replace(/\s/g, '');
}

function demoListId(item: DemoScreeningIngredient): string {
  const casKey = normalizeCasKey(item.cas);
  if (casKey) return `demo-list:${casKey}`;
  return `demo-list:${item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function mergeScreeningIngredientOptions(
  catalog: CatalogOption[],
  demo: DemoScreeningIngredient[],
): {
  formulationOptions: CatalogOption[];
  contaminantOptions: CatalogOption[];
  options: CatalogOption[];
  stats: { total: number; fromCatalog: number; demoOnly: number };
} {
  const catalogByCas = new Map<string, CatalogOption>();
  for (const item of catalog) {
    const key = normalizeCasKey(item.cas);
    if (key && !catalogByCas.has(key)) catalogByCas.set(key, item);
  }

  const formulationCatalog = catalog.filter((item) => item.screeningRole !== 'contaminant_analyte');
  const contaminantCatalog = catalog.filter((item) => item.screeningRole === 'contaminant_analyte');

  const formulation: CatalogOption[] = formulationCatalog.map((item) => ({
    ...item,
    inRuleCatalog: true,
    source: 'catalog',
  }));

  let demoOnly = 0;

  for (const item of demo) {
    const casKey = normalizeCasKey(item.cas);
    const catalogMatch = casKey ? catalogByCas.get(casKey) : undefined;

    if (catalogMatch?.screeningRole === 'formulation_ingredient') {
      const index = formulation.findIndex((row) => row.id === catalogMatch.id);
      if (index >= 0) {
        formulation[index] = {
          ...formulation[index],
          name: item.name,
          cas: item.cas.trim() || formulation[index].cas,
          functionLabel: item.functionLabel || formulation[index].functionLabel,
        };
      }
      continue;
    }

    if (catalogMatch?.screeningRole === 'contaminant_analyte') {
      formulation.push({
        id: demoListId(item),
        name: item.name,
        cas: item.cas.trim() || '-',
        functionLabel: item.functionLabel,
        inRuleCatalog: false,
        screeningRole: 'formulation_ingredient',
        source: 'demo-list',
      });
      demoOnly += 1;
      continue;
    }

    if (casKey && catalogByCas.has(casKey)) {
      continue;
    }

    formulation.push({
      id: demoListId(item),
      name: item.name,
      cas: item.cas.trim() || '-',
      functionLabel: item.functionLabel,
      inRuleCatalog: false,
      screeningRole: 'formulation_ingredient',
      source: 'demo-list',
    });
    demoOnly += 1;
  }

  const contaminantOptions: CatalogOption[] = contaminantCatalog.map((item) => ({
    ...item,
    inRuleCatalog: true,
    source: 'catalog',
  }));

  formulation.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  contaminantOptions.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return {
    formulationOptions: formulation,
    contaminantOptions,
    options: formulation,
    stats: {
      total: formulation.length + contaminantOptions.length,
      fromCatalog: catalog.length,
      demoOnly,
    },
  };
}
