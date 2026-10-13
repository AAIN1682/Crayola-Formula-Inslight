import { describe, expect, it } from 'vitest';
import demoIngredients from '../data/screeningIngredientList.json';
import { mergeScreeningIngredientOptions, normalizeCasKey } from './mergeScreeningCatalog';
import type { CatalogOption } from '../hooks/useCatalogMaterials';

const REQUIRED_EIGHT: { name: string; cas: string }[] = [
  { name: 'Water', cas: '7732-18-5' },
  { name: 'Glycerin', cas: '56-81-5' },
  { name: 'Acid Yellow 23 / Tartrazine', cas: '1934-21-0' },
  { name: 'Sodium Benzoate', cas: '532-32-1' },
  { name: 'Calcium Sulfate Dihydrate / Gypsum', cas: '10101-41-4' },
  { name: 'Copper Powder Flakes', cas: '7440-50-8' },
  { name: 'Starch Gum', cas: '9005-25-8' },
  { name: 'Fine Grade Talc', cas: '14807-96-6' },
];

describe('mergeScreeningIngredientOptions', () => {
  const catalog: CatalogOption[] = [
    {
      id: 's_water',
      name: 'Water',
      cas: '7732-18-5',
      functionLabel: 'Formulation ingredient',
      screeningRole: 'formulation_ingredient',
      inRuleCatalog: true,
      source: 'catalog',
    },
    {
      id: 's_sodium_benzoate_532321',
      name: 'Sodium Benzoate',
      cas: '532-32-1',
      functionLabel: 'Formulation ingredient',
      screeningRole: 'formulation_ingredient',
      inRuleCatalog: true,
      source: 'catalog',
    },
    {
      id: 's_copper_7440508',
      name: 'Copper (Cu)',
      cas: '7440-50-8',
      functionLabel: 'Contaminant / laboratory analyte',
      screeningRole: 'contaminant_analyte',
      inRuleCatalog: true,
      source: 'catalog',
    },
  ];

  it('keeps catalog entry when demo shares CAS and applies display name', () => {
    const { formulationOptions } = mergeScreeningIngredientOptions(catalog, [
      { name: 'Water demo', cas: '7732-18-5', functionLabel: 'Solvent', source: 'demo-list' },
    ]);
    expect(formulationOptions.filter((o) => normalizeCasKey(o.cas) === normalizeCasKey('7732-18-5'))).toHaveLength(1);
    expect(formulationOptions.find((o) => o.id === 's_water')?.name).toBe('Water demo');
  });

  it('adds demo-only rows as not in rule catalog', () => {
    const { formulationOptions, stats } = mergeScreeningIngredientOptions(catalog, [
      { name: 'Glycerin', cas: '56-81-5', functionLabel: 'Humectant', source: 'demo-list' },
    ]);
    const gly = formulationOptions.find((o) => o.name === 'Glycerin');
    expect(gly?.inRuleCatalog).toBe(false);
    expect(stats.demoOnly).toBeGreaterThanOrEqual(1);
  });

  it('keeps contaminant catalog entry separate and adds formulation demo for same CAS', () => {
    const { formulationOptions, contaminantOptions } = mergeScreeningIngredientOptions(catalog, [
      { name: 'Copper Powder Flakes', cas: '7440-50-8', functionLabel: 'Effect', source: 'demo-list' },
    ]);
    expect(contaminantOptions.some((o) => o.id === 's_copper_7440508' && o.name === 'Copper (Cu)')).toBe(true);
    const flakes = formulationOptions.find((o) => o.name === 'Copper Powder Flakes');
    expect(flakes?.id).toMatch(/^demo-list:/);
    expect(flakes?.inRuleCatalog).toBe(false);
    expect(flakes?.screeningRole).toBe('formulation_ingredient');
  });

  it('includes all eight required test-formula ingredients in the formulation list', () => {
    const { formulationOptions } = mergeScreeningIngredientOptions(
      catalog,
      demoIngredients as import('./mergeScreeningCatalog').DemoScreeningIngredient[],
    );
    for (const required of REQUIRED_EIGHT) {
      const match = formulationOptions.find(
        (o) => o.name === required.name && normalizeCasKey(o.cas) === normalizeCasKey(required.cas),
      );
      expect(match, required.name).toBeTruthy();
    }
  });
});
