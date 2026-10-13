import { describe, expect, it } from 'vitest';
import type { PackageAssessment, PackageCheck } from '../api/formulaBackend';
import {
  buildMaterialDisplayMap,
  enteredPercentLabel,
  groupFindingChecks,
  resolveMaterialDisplay,
} from './findingsTableDisplay';

describe('findingsTableDisplay', () => {
  it('groups identical checks across markets', () => {
    const checks: PackageCheck[] = [
      {
        check_id: 'US:legacy:Water:0',
        material_id: 'Water',
        region: 'US',
        status: 'no_matching_rule',
        actual: 78.5,
        message: 'No rule in catalog for this ingredient: Water.',
      },
      {
        check_id: 'EU:legacy:Water:0',
        material_id: 'Water',
        region: 'EU',
        status: 'no_matching_rule',
        actual: 78.5,
        message: 'No rule in catalog for this ingredient: Water.',
      },
    ];
    const grouped = groupFindingChecks(checks);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].markets).toEqual(['EU', 'US']);
  });

  it('shows declared concentration when calculated actual is missing', () => {
    const assessment = {
      llm_context: {
        materials: [{ material_id: 's_sodium_benzoate_532321', name: 'Sodium Benzoate', cas: '532-32-1' }],
        formula: {
          ingredients: [{ material_id: 's_sodium_benzoate_532321', name: 'Sodium Benzoate', concentration_percent: 0.5 }],
        },
      },
    } as PackageAssessment;
    const check: PackageCheck = {
      check_id: 'US:benzoate',
      material_id: 's_sodium_benzoate_532321',
      region: 'US',
      status: 'source_review_required',
      actual: null,
      threshold: 0.5,
      unit: '%',
      message: 'Pending verification.',
    };
    expect(enteredPercentLabel(check, assessment)).toBe('0.5%');
    const map = buildMaterialDisplayMap(assessment);
    expect(resolveMaterialDisplay('Water', map).name).toBe('Water');
  });
});
