import { useEffect, useState } from 'react';

import type { AgeGroup, ProductCategory, TargetMarket } from '../types/domain';

import { fetchPackageCatalog } from '../api/formulaBackend';

import demoIngredients from '../data/screeningIngredientList.json';

import { mergeScreeningIngredientOptions, type DemoScreeningIngredient } from '../utils/mergeScreeningCatalog';



export interface CatalogOption {

  id: string;

  name: string;

  cas: string;

  functionLabel: string;

  screeningRole?: 'formulation_ingredient' | 'contaminant_analyte' | 'role_requires_review';

  inRuleCatalog: boolean;

  source?: 'catalog' | 'demo-list';

}



const ROLE_LABELS: Record<string, string> = {

  formulation_ingredient: 'Formulation ingredient',

  contaminant_analyte: 'Contaminant / laboratory analyte',

  role_requires_review: 'Role requires review',

};



function catalogScreeningRole(role: string | undefined): CatalogOption['screeningRole'] {

  if (role === 'contaminant_analyte' || role === 'role_requires_review' || role === 'formulation_ingredient') {

    return role;

  }

  return undefined;

}



export function useCatalogMaterials(
  _category: ProductCategory,
  _ageGroup: AgeGroup,
  _markets: TargetMarket[],
): {

  options: CatalogOption[];

  formulationOptions: CatalogOption[];

  contaminantOptions: CatalogOption[];

  loading: boolean;

  error?: string;

  stats?: { total: number; fromCatalog: number; demoOnly: number };

} {

  const [options, setOptions] = useState<CatalogOption[]>([]);

  const [formulationOptions, setFormulationOptions] = useState<CatalogOption[]>([]);

  const [contaminantOptions, setContaminantOptions] = useState<CatalogOption[]>([]);

  const [stats, setStats] = useState<{ total: number; fromCatalog: number; demoOnly: number }>();

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string>();



  useEffect(() => {

    let cancelled = false;

    setLoading(true);

    setError(undefined);



    async function load() {

      try {

        const materials = await fetchPackageCatalog();

        if (cancelled) return;

        const catalogOptions: CatalogOption[] = materials.map((item) => ({

          id: item.material_id,

          name: item.name,

          cas: item.cas?.trim() || '-',

          functionLabel: ROLE_LABELS[item.kind?.trim() ?? ''] ?? (item.kind?.trim() || '-'),

          screeningRole: catalogScreeningRole(item.kind?.trim()),

          inRuleCatalog: true,

          source: 'catalog',

        }));

        const merged = mergeScreeningIngredientOptions(catalogOptions, demoIngredients as DemoScreeningIngredient[]);

        setOptions(merged.formulationOptions);

        setFormulationOptions(merged.formulationOptions);

        setContaminantOptions(merged.contaminantOptions);

        setStats(merged.stats);

      } catch {

        if (!cancelled) setError('Catalog could not be loaded.');

      } finally {

        if (!cancelled) setLoading(false);

      }

    }



    void load();

    return () => {

      cancelled = true;

    };

    // Full rule catalog is not filtered by product context; fetch once per mount.
  }, []);



  return { options, formulationOptions, contaminantOptions, loading, error, stats };

}

