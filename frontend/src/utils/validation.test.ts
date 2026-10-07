import { describe, expect, it } from 'vitest';
import type { FormulaInput } from '../types/services';
import {
  CONCENTRATION_TOLERANCE,
  isTotalWithinTolerance,
  sumConcentrations,
  validateFormulaInput,
} from './validation';

function baseInput(overrides: Partial<FormulaInput> = {}): FormulaInput {
  return {
    name: 'ColorFlow Test Marker',
    category: 'Markers',
    ageGroup: 'Below 12',
    physicalForm: 'Liquid',
    intendedUse: 'Broad-line colouring marker for classroom use on paper.',
    ownerId: 'usr-dana',
    ingredients: [
      { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101', concentration: 70, supplier: 'Northbridge' },
      { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 20, supplier: 'Marlow' },
      { name: 'Cyan Dispersion Pigment C-14', rawMaterialId: 'RM-103', concentration: 10, supplier: 'Helix' },
    ],
    evidenceIds: ['DOC-FRM-1001-01'],
    ...overrides,
  };
}

describe('concentration totals', () => {
  it('sums without floating point drift', () => {
    expect(sumConcentrations([{ concentration: 0.1 }, { concentration: 0.2 }])).toBe(0.3);
  });

  it('accepts a total of exactly 100%', () => {
    expect(isTotalWithinTolerance(100)).toBe(true);
  });

  it('accepts a total inside the explicit rounding tolerance', () => {
    expect(isTotalWithinTolerance(100 - CONCENTRATION_TOLERANCE)).toBe(true);
    expect(isTotalWithinTolerance(100 + CONCENTRATION_TOLERANCE)).toBe(true);
    expect(isTotalWithinTolerance(99.8)).toBe(true);
  });

  it('rejects a total outside the tolerance', () => {
    expect(isTotalWithinTolerance(98)).toBe(false);
    expect(isTotalWithinTolerance(101.2)).toBe(false);
  });
});

describe('formula validation', () => {
  it('accepts a complete, balanced formula', () => {
    const result = validateFormulaInput(baseInput());

    expect(result.errors).toHaveLength(0);
    expect(result.isComplete).toBe(true);
    expect(result.total).toBe(100);
    expect(result.totalWithinTolerance).toBe(true);
  });

  it('reports an error when concentrations do not reach 100%', () => {
    const result = validateFormulaInput(
      baseInput({
        ingredients: [
          { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101', concentration: 70 },
          { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 20 },
        ],
      }),
    );

    expect(result.isComplete).toBe(false);
    expect(result.total).toBe(90);
    expect(result.errors.some((issue) => issue.field === 'ingredients.total')).toBe(true);
    expect(result.missingFieldLabels).toContain('Balanced composition');
  });

  it('rejects a concentration that is not a number', () => {
    const result = validateFormulaInput(
      baseInput({
        ingredients: [
          { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101', concentration: Number.NaN },
          { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 100 },
        ],
      }),
    );

    expect(result.errors.some((issue) => issue.field === 'ingredients.0.concentration')).toBe(true);
  });

  it('rejects a zero or negative concentration', () => {
    const result = validateFormulaInput(
      baseInput({
        ingredients: [
          { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101', concentration: 100 },
          { name: 'Trace additive', rawMaterialId: 'RM-121', concentration: 0 },
        ],
      }),
    );

    expect(result.errors.some((issue) => issue.field === 'ingredients.1.concentration')).toBe(true);
  });

  it('rejects a concentration above 100%', () => {
    const result = validateFormulaInput(
      baseInput({
        ingredients: [{ name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101', concentration: 140 }],
      }),
    );

    expect(result.errors.some((issue) => issue.field === 'ingredients.0.concentration')).toBe(true);
  });

  it('lists every missing required field so a draft can show what is outstanding', () => {
    const result = validateFormulaInput({
      name: '',
      intendedUse: '',
      ownerId: '',
      ingredients: [],
      evidenceIds: [],
    });

    expect(result.isComplete).toBe(false);
    expect(result.missingFieldLabels).toEqual(
      expect.arrayContaining([
        'Formula name',
        'Product category',
        'Intended age group',
        'Physical form',
        'Owner',
        'Intended use',
        'Ingredients',
      ]),
    );
  });

  it('warns — but does not block — when an ingredient has no raw-material reference', () => {
    const result = validateFormulaInput(
      baseInput({
        ingredients: [
          { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101', concentration: 70, supplier: 'N' },
          { name: 'Gum Arabic Binder', concentration: 30, supplier: 'Unknown' },
        ],
      }),
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((issue) => issue.field === 'ingredients.1.rawMaterialId')).toBe(true);
  });

  it('warns about duplicate ingredient names', () => {
    const result = validateFormulaInput(
      baseInput({
        ingredients: [
          { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101', concentration: 50, supplier: 'N' },
          { name: 'aqua base concentrate', rawMaterialId: 'RM-101', concentration: 50, supplier: 'N' },
        ],
      }),
    );

    expect(result.warnings.some((issue) => issue.message.includes('already listed'))).toBe(true);
  });
});
