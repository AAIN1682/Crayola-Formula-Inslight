import assert from 'node:assert/strict';
import test from 'node:test';
import { assessFormula, listExamples } from './assess.js';
import { loadReference } from './reference.js';

const stubExplain = async () => ({
  explanation: {
    summary: 'Stub explanation.',
    finding_explanations: [],
    alerts: [],
    next_steps: [],
  },
  explanation_source: 'azure',
});

function requestFrom(formula, ingredients = formula.ingredients) {
  return {
    formula_name: formula.formula_name,
    product_category: formula.product_category,
    target_markets: formula.target_markets,
    age_group: formula.age_group,
    composition_basis: formula.composition_basis,
    ingredients,
  };
}

test('example and historical compositions total 100%', () => {
  const reference = loadReference();
  for (const formula of reference.examples) {
    const total = formula.ingredients.reduce((sum, row) => sum + row.concentration_pct, 0);
    assert.ok(Math.abs(total - 100) <= 0.01, formula.formula_id);
  }
  for (const item of reference.historicalCases) {
    const total = item.composition.reduce((sum, row) => sum + row.concentration_pct, 0);
    assert.ok(Math.abs(total - 100) <= 0.01, item.case_id);
    assert.equal(item.synthetic, true);
  }
});

test('ingredient, rule, and document references resolve', () => {
  const reference = loadReference();
  const ids = new Set(reference.ingredients.map((item) => item.ingredient_id));
  const documents = new Set(reference.documents.map((item) => item.document_id));
  for (const rule of reference.rules) assert.ok(ids.has(rule.ingredient_id), rule.rule_id);
  for (const requirement of reference.evidenceRequirements) {
    if (requirement.ingredient_id) assert.ok(ids.has(requirement.ingredient_id), requirement.requirement_id);
  }
  for (const document of reference.documents) assert.ok(ids.has(document.ingredient_id), document.document_id);
  for (const ingredient of reference.ingredients) {
    for (const evidenceId of ingredient.evidence_ids) assert.ok(documents.has(evidenceId), evidenceId);
  }
  for (const formula of reference.examples) {
    for (const row of formula.ingredients) assert.ok(ids.has(row.ingredient_id), formula.formula_id);
  }
  for (const item of reference.historicalCases) {
    for (const row of item.composition) assert.ok(ids.has(row.ingredient_id), item.case_id);
  }
});

test('crossing a configured threshold changes the concentration result', async () => {
  const { formulas } = listExamples();
  const high = formulas.find((item) => item.formula_id === 'EX-002');
  const within = formulas.find((item) => item.formula_id === 'EX-001');
  const failed = await assessFormula(requestFrom(high), { explain: stubExplain });
  const passed = await assessFormula(requestFrom(within), { explain: stubExplain });
  const highGlycerol = failed.concentration_findings.find((item) => item.ingredient_id === 'ING-002');
  const lowGlycerol = passed.concentration_findings.find((item) => item.ingredient_id === 'ING-002');
  assert.equal(highGlycerol.result, 'fail');
  assert.equal(lowGlycerol.result, 'pass');
  assert.equal(failed.overall_status, 'changes_required');
  assert.notEqual(passed.overall_status, 'meets_reference_criteria');
  assert.equal(passed.acceptance_probability, null);
  assert.equal(JSON.stringify(passed.input_snapshot).includes('100% is a passed safety check'), false);
});

test('missing and unverified evidence stays not assessed', async () => {
  const { formulas } = listExamples();
  const within = formulas.find((item) => item.formula_id === 'EX-001');
  const result = await assessFormula(requestFrom(within), { explain: stubExplain });
  const glycerolEvidence = result.evidence_findings.find((item) => item.check_id.startsWith('CHK-REQ-001'));
  const coa = result.evidence_findings.find((item) => item.check_id.startsWith('CHK-REQ-004'));
  assert.equal(glycerolEvidence.result, 'not_assessed');
  assert.equal(coa.result, 'not_assessed');
  assert.ok(result.missing_documents.some((item) => item.status === 'pending_review'));
  assert.ok(result.missing_documents.some((item) => item.status === 'absent'));
  assert.equal(result.evidence_findings.some((item) => item.result === 'pass'), false);
});

test('an ingredient without a criterion is not an automatic pass', async () => {
  const { formulas } = listExamples();
  const formula = formulas.find((item) => item.formula_id === 'EX-003');
  const result = await assessFormula(requestFrom(formula), { explain: stubExplain });
  const stearic = result.concentration_findings.find((item) => item.ingredient_id === 'ING-006');
  assert.equal(stearic.result, 'not_assessed');
  assert.equal(stearic.reason, 'No configured criterion.');
  assert.notEqual(result.overall_status, 'meets_reference_criteria');
  assert.ok(result.configuration_gaps.some((item) => item.ingredient_id === 'ING-006'));
});

test('an unsupported category does not pass', async () => {
  const { formulas } = listExamples();
  const formula = formulas.find((item) => item.formula_id === 'EX-001');
  const result = await assessFormula(
    { ...requestFrom(formula), product_category: 'unsupported_product' },
    { explain: stubExplain },
  );
  assert.equal(result.overall_status, 'not_assessed');
  assert.equal(result.concentration_findings.some((item) => item.result === 'pass'), false);
  assert.equal(result.results_by_market[0].status, 'not_assessed');
});

test('a market with no applicable rule does not pass', async () => {
  const reference = loadReference();
  const limited = {
    ...reference,
    rules: reference.rules
      .filter((rule) => rule.rule_id === 'RULE-MARKER-GLYCEROL-001')
      .map((rule) => ({ ...rule, target_markets: ['US'] })),
    evidenceRequirements: [],
    historicalCases: [],
  };
  const result = await assessFormula(
    {
      formula_name: 'Market gap',
      product_category: 'water_based_marker_ink',
      target_markets: ['UK'],
      age_group: 'under_12',
      composition_basis: 'percent_w_w',
      ingredients: [
        { ingredient_id: 'ING-001', concentration_pct: 90 },
        { ingredient_id: 'ING-002', concentration_pct: 10 },
      ],
    },
    { reference: limited, explain: stubExplain },
  );
  assert.notEqual(result.overall_status, 'meets_reference_criteria');
  assert.equal(result.results_by_market[0].status, 'not_assessed');
  assert.equal(result.concentration_findings.some((item) => item.result === 'pass'), false);
});

test('a failed explanation keeps the calculated checks', async () => {
  const { formulas } = listExamples();
  const formula = formulas.find((item) => item.formula_id === 'EX-002');
  const result = await assessFormula(requestFrom(formula), {
    explain: async () => {
      throw new Error('simulated upstream failure');
    },
  });
  assert.equal(result.explanation_source, 'standard');
  assert.match(result.explanation.summary, /unavailable/i);
  assert.equal(result.concentration_findings.find((item) => item.ingredient_id === 'ING-002').result, 'fail');
  assert.equal(result.acceptance_probability, null);
});

test('composition that does not total 100% is rejected before screening', async () => {
  await assert.rejects(
    () =>
      assessFormula(
        {
          formula_name: 'Short',
          product_category: 'water_based_marker_ink',
          target_markets: ['US'],
          age_group: 'under_12',
          composition_basis: 'percent_w_w',
          ingredients: [
            { ingredient_id: 'ING-001', concentration_pct: 90 },
            { ingredient_id: 'ING-002', concentration_pct: 5 },
          ],
        },
        { explain: stubExplain },
      ),
    /must equal 100%/,
  );
});
