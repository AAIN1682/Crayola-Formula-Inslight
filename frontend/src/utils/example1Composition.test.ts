import { describe, expect, it } from 'vitest';
import { formulaToPackageRequest } from '../api/formulaBackend';
import type { Formula } from '../types/domain';
import { defaultDraft, emptyCompositionRow } from '../types/newScreening';
import { draftToFormulaInput } from './newScreeningSave';

const BENZOATE = 's_sodium_benzoate_532321';

function exampleOneDraft() {
  const draft = defaultDraft();
  draft.name = 'Example 1 watercolor base';
  draft.category = 'Paints';
  draft.physicalForm = 'Liquid';
  draft.ageGrade = '3+';
  draft.targetMarkets = ['US'];
  draft.intendedUse = 'Washable liquid watercolor for children.';
  draft.ingredients = [
    {
      ...emptyCompositionRow(),
      name: 'Water',
      cas: '7732-18-5',
      pct: '78.5',
      inRuleCatalog: false,
      screeningRole: 'formulation_ingredient',
    },
    {
      ...emptyCompositionRow(),
      name: 'Glycerin',
      cas: '56-81-5',
      pct: '12.5',
      inRuleCatalog: false,
      screeningRole: 'formulation_ingredient',
    },
    {
      ...emptyCompositionRow(),
      name: 'Acid Yellow 23 / Tartrazine',
      cas: '1934-21-0',
      pct: '8.5',
      inRuleCatalog: false,
      screeningRole: 'formulation_ingredient',
    },
    {
      ...emptyCompositionRow(),
      name: 'Sodium benzoate',
      cas: '532-32-1',
      pct: '0.5',
      catalogId: BENZOATE,
      inRuleCatalog: true,
      screeningRole: 'formulation_ingredient',
    },
  ];
  return draft;
}

function asFormula(input: ReturnType<typeof draftToFormulaInput>, id = 'FML-9001'): Formula {
  return {
    id,
    name: input.name,
    version: input.version ?? 'v1.0',
    category: input.category ?? 'Paints',
    ageGroup: input.ageGroup ?? 'under_12',
    targetMarkets: input.targetMarkets ?? ['US'],
    physicalForm: input.physicalForm ?? 'Liquid',
    intendedUse: input.intendedUse,
    ownerId: input.ownerId ?? '',
    lifecycle: 'active',
    ingredients: input.ingredients.map((row, index) => ({
      id: `${id}-ING-${index + 1}`,
      name: row.name,
      rawMaterialId: row.rawMaterialId,
      concentration: row.concentration,
      evidenceIds: row.evidenceIds ?? [],
      screeningRole: row.screeningRole,
      inRuleCatalog: row.inRuleCatalog,
      casNumber: row.casNumber,
      notes: row.notes,
    })),
    evidenceIds: input.evidenceIds ?? [],
    compositionCompleteness: input.compositionCompleteness,
    screeningStatus: 'not-screened',
    screeningCurrent: false,
    reviewStatus: 'not-started',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe('Example 1 composition payload', () => {
  it('counts all four declared rows toward assessment (100%) with legacy gaps flagged', () => {
    const input = draftToFormulaInput(exampleOneDraft(), 'active');
    expect(input.ingredients.every((row) => row.screeningRole === 'formulation_ingredient')).toBe(true);
    expect(input.ingredients.filter((row) => row.inRuleCatalog === false)).toHaveLength(3);

    const catalogIds = new Set([BENZOATE]);
    const body = formulaToPackageRequest(asFormula(input), true, 'evidence', catalogIds);
    expect(body.composition_completeness).toBe('complete');
    expect(body.ingredients).toHaveLength(1);
    expect(body.ingredients[0].material_id).toBe(BENZOATE);
    expect(body.legacy_materials).toHaveLength(3);

    const legacyTotal = body.legacy_materials.reduce(
      (sum, row) => sum + (row.concentration_percent ?? 0),
      0,
    );
    const catalogTotal = body.ingredients.reduce(
      (sum, row) => sum + (row.concentration_percent ?? 0),
      0,
    );
    expect(legacyTotal + catalogTotal).toBe(100);
    expect(body.legacy_materials.every((row) => row.in_rule_catalog === false)).toBe(true);
    expect(body.legacy_materials.every((row) => row.screening_role === 'formulation_ingredient')).toBe(true);
    expect(body.legacy_materials.every((row) => row.cas_number)).toBe(true);
  });

  it('still maps a genuinely incomplete formula for backend rejection', () => {
    const draft = exampleOneDraft();
    draft.ingredients = [draft.ingredients[0]];
    const input = draftToFormulaInput(draft, 'active');
    const body = formulaToPackageRequest(asFormula(input), true, 'evidence', new Set());
    const total = [...body.ingredients, ...body.legacy_materials].reduce(
      (sum, row) => sum + (row.concentration_percent ?? 0),
      0,
    );
    expect(total).toBe(78.5);
    expect(body.composition_completeness).toBe('partial');
  });
});
