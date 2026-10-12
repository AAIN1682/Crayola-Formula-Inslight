import { useEffect, useState } from 'react';
import type { AgeGroup, ProductCategory, TargetMarket } from '../types/domain';
import { fetchPackageCatalog } from '../api/formulaBackend';

export interface CatalogOption {
  id: string;
  name: string;
  cas: string;
  functionLabel: string;
  screeningRole?: 'formulation_ingredient' | 'contaminant_analyte' | 'role_requires_review';
}

export function useCatalogMaterials(
  category: ProductCategory,
  ageGroup: AgeGroup,
  markets: TargetMarket[],
): { options: CatalogOption[]; loading: boolean; error?: string } {
  const [options, setOptions] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const region = markets.find((market) => market === 'US' || market === 'EU') ?? 'US';
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    async function load() {
      try {
        const params = new URLSearchParams({
          regions: region,
          category,
          age_group: ageGroup,
        });
        const substanceResponse = await fetch(`/api/reference/substances?${params}`);
        if (substanceResponse.ok) {
          const body = (await substanceResponse.json()) as {
            substances?: { substance_id: string; label?: string; role_label?: string; role?: string; cas_number?: string | null }[];
          };
          const fromRef = (body.substances ?? []).map((item) => ({
            id: item.substance_id,
            name: item.label ?? item.substance_id,
            cas: item.cas_number?.trim() || '-',
            functionLabel: item.role_label?.trim() || '-',
            screeningRole:
              item.role === 'contaminant_analyte'
                ? 'contaminant_analyte'
                : item.role === 'role_requires_review'
                  ? 'role_requires_review'
                  : 'formulation_ingredient',
          }));
          if (!cancelled && fromRef.length > 0) {
            setOptions(fromRef);
            setLoading(false);
            return;
          }
        }
        const materials = await fetchPackageCatalog();
        if (cancelled) return;
        setOptions(
          materials.map((item) => ({
            id: item.material_id,
            name: item.name,
            cas: item.cas?.trim() || '-',
            functionLabel: item.kind?.trim() || '-',
          })),
        );
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
  }, [category, ageGroup, markets.join(',')]);

  return { options, loading, error };
}
