import { randomUUID } from 'node:crypto';
import { explainWithAzure } from './azure.js';
import { loadReference } from './reference.js';

const MARKETS = new Set(['US', 'EU', 'UK', 'CA']);
const AGES = new Set(['under_12', '12_and_above']);
const TOTAL_TOLERANCE = 0.01;

export class AssessmentError extends Error {
  constructor(message, statusCode = 422) {
    super(message);
    this.statusCode = statusCode;
    this.publicMessage = message;
  }
}

function roundMetric(value) {
  if (value == null) return null;
  return Math.round(value * 10) / 10;
}

export function groupMetrics(findings) {
  const applicable = findings.filter((finding) => finding.result !== 'not_applicable');
  const passed = applicable.filter((finding) => finding.result === 'pass').length;
  const failed = applicable.filter((finding) => finding.result === 'fail').length;
  const notAssessed = applicable.filter((finding) => finding.result === 'not_assessed').length;
  const decided = passed + failed;
  return {
    applicable: applicable.length,
    passed,
    failed,
    not_assessed: notAssessed,
    coverage: applicable.length === 0 ? null : roundMetric((decided / applicable.length) * 100),
    pass_rate: decided === 0 ? null : roundMetric((passed / decided) * 100),
  };
}

function criterionLabel(rule) {
  return `${rule.minimum_pct}–${rule.maximum_pct}`;
}

function withinRange(value, rule) {
  const aboveMin = rule.minimum_inclusive ? value >= rule.minimum_pct : value > rule.minimum_pct;
  const belowMax = rule.maximum_inclusive ? value <= rule.maximum_pct : value < rule.maximum_pct;
  return aboveMin && belowMax;
}

function applies(record, category, market, age) {
  return (
    record.product_category === category &&
    record.target_markets?.includes(market) &&
    record.age_groups?.includes(age) &&
    record.enabled !== false
  );
}

function finding(partial) {
  return {
    check_id: partial.check_id,
    ingredient_id: partial.ingredient_id,
    ingredient_name: partial.ingredient_name,
    result: partial.result,
    entered_value: partial.entered_value ?? null,
    criterion: partial.criterion ?? null,
    unit: partial.unit ?? null,
    basis: partial.basis ?? null,
    source_type: partial.source_type,
    evidence_ids: partial.evidence_ids ?? [],
    reason: partial.reason,
    recommended_action: partial.recommended_action,
  };
}

function standardExplanation(concentrationFindings, evidenceFindings, missingDocuments) {
  const failed = concentrationFindings.filter((item) => item.result === 'fail');
  const gaps = concentrationFindings.filter((item) => item.result === 'not_assessed');
  const summaryParts = ['The AI explanation is unavailable. Calculated checks are unchanged.'];
  if (failed.length) {
    summaryParts.push(
      `Concentration checks that did not meet the reference range: ${failed.map((item) => item.check_id).join(', ')}.`,
    );
  }
  if (missingDocuments.length) {
    summaryParts.push(`${missingDocuments.length} required document check${missingDocuments.length === 1 ? ' is' : 's are'} not assessed.`);
  }
  const combined = [...concentrationFindings, ...evidenceFindings];
  return {
    summary: summaryParts.join(' '),
    finding_explanations: combined.map((item) => ({
      check_id: item.check_id,
      explanation: item.reason,
      recommended_action: item.recommended_action,
      evidence_ids: item.evidence_ids,
    })),
    alerts: ['AI explanation is unavailable.'],
    next_steps: [...failed, ...gaps, ...evidenceFindings.filter((item) => item.result === 'not_assessed')]
      .map((item) => item.recommended_action)
      .filter((item, index, all) => item && all.indexOf(item) === index)
      .slice(0, 6),
  };
}

function rollup(concentration, evidence) {
  if (concentration.some((item) => item.result === 'fail')) return 'changes_required';
  const configured = concentration.filter((item) => item.source_type !== 'configuration');
  const onlyUnconfigured =
    configured.length === 0 && evidence.length === 0 && concentration.some((item) => item.result === 'not_assessed');
  if (onlyUnconfigured) return 'not_assessed';
  if (
    concentration.some((item) => item.result === 'not_assessed') ||
    evidence.some((item) => item.result === 'not_assessed')
  ) {
    return 'additional_information_required';
  }
  if (concentration.some((item) => item.result === 'pass')) return 'meets_reference_criteria';
  return 'not_assessed';
}

function validateInput(input, ingredientsById) {
  if (!input || typeof input !== 'object') throw new AssessmentError('The assessment request is missing.');
  const name = typeof input.formula_name === 'string' ? input.formula_name.trim() : '';
  if (!name) throw new AssessmentError('A formula name is required.');
  if (typeof input.product_category !== 'string' || !input.product_category.trim()) {
    throw new AssessmentError('A product category is required.');
  }
  if (!Array.isArray(input.target_markets) || input.target_markets.length === 0) {
    throw new AssessmentError('Select at least one target market.');
  }
  const markets = [...new Set(input.target_markets)];
  if (markets.some((market) => !MARKETS.has(market))) {
    throw new AssessmentError('A target market is not supported.');
  }
  if (!AGES.has(input.age_group)) throw new AssessmentError('An age group is required.');
  if (input.composition_basis !== 'percent_w_w') {
    throw new AssessmentError('Composition must be entered as percent weight/weight.');
  }
  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw new AssessmentError('Add at least one ingredient.');
  }
  const seen = new Set();
  const rows = input.ingredients.map((row, index) => {
    const ingredientId = row?.ingredient_id;
    if (typeof ingredientId !== 'string' || !ingredientsById.has(ingredientId)) {
      throw new AssessmentError(`Ingredient ${index + 1} is not in the reference catalog.`);
    }
    if (seen.has(ingredientId)) throw new AssessmentError(`${ingredientId} is listed more than once.`);
    seen.add(ingredientId);
    const concentration = Number(row.concentration_pct);
    if (!Number.isFinite(concentration) || concentration < 0 || concentration > 100) {
      throw new AssessmentError(`${ingredientsById.get(ingredientId).name} needs a percentage from 0 to 100.`);
    }
    return { ingredient_id: ingredientId, concentration_pct: concentration };
  });
  const total = rows.reduce((sum, row) => sum + row.concentration_pct, 0);
  if (Math.abs(total - 100) > TOTAL_TOLERANCE) {
    throw new AssessmentError(`Composition totals ${Math.round(total * 100) / 100}%. It must equal 100%.`);
  }
  return {
    formula_name: name,
    product_category: input.product_category.trim(),
    target_markets: markets,
    age_group: input.age_group,
    composition_basis: 'percent_w_w',
    ingredients: rows,
  };
}

function linkedDocuments(reference, ingredientId, documentType) {
  return reference.documents.filter(
    (document) => document.ingredient_id === ingredientId && document.document_type === documentType,
  );
}

export async function assessFormula(input, options = {}) {
  const reference = options.reference ?? loadReference();
  const explain = options.explain ?? explainWithAzure;
  const ingredientsById = new Map(reference.ingredients.map((item) => [item.ingredient_id, item]));
  const snapshot = validateInput(input, ingredientsById);
  const present = new Map(snapshot.ingredients.map((row) => [row.ingredient_id, row.concentration_pct]));

  const concentrationFindings = [];
  const evidenceFindings = [];
  const missingDocuments = [];
  const configurationGaps = [];
  const resultsByMarket = [];

  for (const market of snapshot.target_markets) {
    const marketConcentration = [];
    const marketEvidence = [];
    const marketGaps = [];

    for (const row of snapshot.ingredients) {
      const ingredient = ingredientsById.get(row.ingredient_id);
      const rules = reference.rules.filter(
        (rule) => rule.ingredient_id === row.ingredient_id && applies(rule, snapshot.product_category, market, snapshot.age_group),
      );
      if (rules.length === 0) {
        const gap = finding({
          check_id: `CHK-${market}-${row.ingredient_id}-NO-CRITERION`,
          ingredient_id: row.ingredient_id,
          ingredient_name: ingredient.name,
          result: 'not_assessed',
          entered_value: row.concentration_pct,
          criterion: null,
          unit: 'percent_w_w',
          basis: ingredient.is_mixture ? 'as_supplied_material_in_finished_formula' : 'as_supplied_material_in_finished_formula',
          source_type: 'configuration',
          reason: 'No configured criterion.',
          recommended_action: 'Add a reference criterion for this ingredient and product category, or remove it from the formula before treating the check as complete.',
        });
        marketConcentration.push(gap);
        marketGaps.push({
          market,
          ingredient_id: row.ingredient_id,
          ingredient_name: ingredient.name,
          message: 'No configured criterion.',
        });
        continue;
      }
      for (const rule of rules) {
        const passes = withinRange(row.concentration_pct, rule);
        const mixtureNote = ingredient.is_mixture
          ? ' The purchased mixture is checked at the entered as-supplied percentage.'
          : '';
        marketConcentration.push(
          finding({
            check_id: `CHK-${rule.rule_id}-${market}`,
            ingredient_id: row.ingredient_id,
            ingredient_name: ingredient.name,
            result: passes ? 'pass' : 'fail',
            entered_value: row.concentration_pct,
            criterion: criterionLabel(rule),
            unit: rule.unit,
            basis: rule.basis,
            source_type: rule.authority_type,
            reason: passes
              ? `${ingredient.name} at ${row.concentration_pct}% is inside the illustrative range ${criterionLabel(rule)}%.${mixtureNote}`
              : `${ingredient.name} at ${row.concentration_pct}% is outside the illustrative range ${criterionLabel(rule)}%.${mixtureNote}`,
            recommended_action: passes
              ? 'No concentration change is indicated by this reference criterion.'
              : 'Review the entered percentage against the illustrative range before reassessment.',
          }),
        );
      }
    }

    const requirements = reference.evidenceRequirements.filter(
      (requirement) =>
        requirement.required === true &&
        applies(requirement, snapshot.product_category, market, snapshot.age_group) &&
        (requirement.ingredient_id == null || present.has(requirement.ingredient_id)),
    );
    for (const requirement of requirements) {
      const ingredient = requirement.ingredient_id ? ingredientsById.get(requirement.ingredient_id) : null;
      const documents = requirement.ingredient_id
        ? linkedDocuments(reference, requirement.ingredient_id, requirement.document_type)
        : reference.documents.filter((document) => document.document_type === requirement.document_type && !document.ingredient_id);
      const verified = documents.filter(
        (document) => document.verification_status === 'verified' && document.content_origin !== 'illustrative',
      );
      const label = ingredient?.name ?? snapshot.formula_name;
      if (verified.length > 0) {
        marketEvidence.push(
          finding({
            check_id: `CHK-${requirement.requirement_id}-${market}`,
            ingredient_id: requirement.ingredient_id,
            ingredient_name: label,
            result: 'pass',
            criterion: requirement.document_type,
            unit: null,
            basis: requirement.scope,
            source_type: requirement.authority_type,
            evidence_ids: verified.map((document) => document.document_id),
            reason: `Verified ${requirement.document_type} is linked for ${label}.`,
            recommended_action: 'No further document is required for this check.',
          }),
        );
        continue;
      }
      const unverifiedIds = documents.map((document) => document.document_id);
      const absent = documents.length === 0;
      marketEvidence.push(
        finding({
          check_id: `CHK-${requirement.requirement_id}-${market}`,
          ingredient_id: requirement.ingredient_id,
          ingredient_name: label,
          result: 'not_assessed',
          criterion: requirement.document_type,
          basis: requirement.scope,
          source_type: requirement.authority_type,
          evidence_ids: unverifiedIds,
          reason: absent
            ? `Required ${requirement.document_type} for ${label} is not on file.`
            : `Linked ${requirement.document_type} for ${label} is illustrative or unverified, so the requirement stays pending review.`,
          recommended_action: absent
            ? `Provide a ${requirement.document_type} for ${label}.`
            : 'Replace the illustrative record with verified evidence before this check can be completed.',
        }),
      );
      missingDocuments.push({
        requirement_id: requirement.requirement_id,
        market,
        ingredient_id: requirement.ingredient_id,
        ingredient_name: label,
        document_type: requirement.document_type,
        scope: requirement.scope,
        linked_document_ids: unverifiedIds,
        status: absent ? 'absent' : 'pending_review',
      });
    }

    const status = rollup(marketConcentration, marketEvidence);
    resultsByMarket.push({
      market,
      status,
      message:
        status === 'not_assessed'
          ? 'Assessment criteria are not configured for this market.'
          : status === 'changes_required'
            ? 'One or more illustrative concentration checks did not pass.'
            : status === 'additional_information_required'
              ? 'Concentration screening is separate from evidence that is still not assessed.'
              : 'Configured concentration checks passed. This is not a regulatory acceptance.',
    });
    if (market === snapshot.target_markets[0]) {
      concentrationFindings.push(...marketConcentration);
      evidenceFindings.push(...marketEvidence);
      configurationGaps.push(...marketGaps);
    } else {
      for (const item of marketConcentration) {
        if (!concentrationFindings.some((existing) => existing.check_id === item.check_id)) concentrationFindings.push(item);
      }
      for (const item of marketEvidence) {
        if (!evidenceFindings.some((existing) => existing.check_id === item.check_id)) evidenceFindings.push(item);
      }
      configurationGaps.push(...marketGaps.filter((gap) => !configurationGaps.some((existing) => existing.market === gap.market && existing.ingredient_id === gap.ingredient_id)));
    }
  }

  const relevantCases = reference.historicalCases.filter(
    (item) =>
      item.product_category === snapshot.product_category &&
      (item.age_group === snapshot.age_group || item.target_markets.some((market) => snapshot.target_markets.includes(market))),
  );

  const metrics = {
    concentration: groupMetrics(concentrationFindings),
    evidence: groupMetrics(evidenceFindings),
    acceptance_probability: null,
  };

  const statuses = resultsByMarket.map((item) => item.status);
  const overallStatus = statuses.includes('changes_required')
    ? 'changes_required'
    : statuses.includes('additional_information_required')
      ? 'additional_information_required'
      : statuses.every((status) => status === 'meets_reference_criteria')
        ? 'meets_reference_criteria'
        : 'not_assessed';

  const evidenceForModel = reference.documents
    .filter((document) => snapshot.ingredients.some((row) => row.ingredient_id === document.ingredient_id))
    .map((document) => ({
      document_id: document.document_id,
      document_type: document.document_type,
      ingredient_id: document.ingredient_id,
      title: document.title,
      content_origin: document.content_origin,
      verification_status: document.verification_status,
      excerpt: document.excerpt,
    }));

  const selectedRules = reference.rules
    .filter(
      (rule) =>
        present.has(rule.ingredient_id) &&
        rule.product_category === snapshot.product_category &&
        rule.age_groups.includes(snapshot.age_group) &&
        rule.target_markets.some((market) => snapshot.target_markets.includes(market)) &&
        rule.enabled !== false,
    )
    .map((rule) => ({
      rule_id: rule.rule_id,
      ingredient_id: rule.ingredient_id,
      minimum_pct: rule.minimum_pct,
      maximum_pct: rule.maximum_pct,
      unit: rule.unit,
      authority_type: rule.authority_type,
      is_regulatory_limit: rule.is_regulatory_limit,
      requires_expert_validation: rule.requires_expert_validation,
    }));

  const payload = {
    formula: snapshot,
    rules: selectedRules,
    findings: { concentration: concentrationFindings, evidence: evidenceFindings },
    evidence: evidenceForModel,
    missing_documents: missingDocuments,
    historical_cases: relevantCases,
    metrics,
  };

  let explanation;
  let explanationSource = 'standard';
  try {
    const explained = await explain(payload);
    explanation = explained?.explanation ?? explained;
    if (!explanation?.summary || !Array.isArray(explanation.finding_explanations)) {
      throw new Error('Explanation did not match the expected structure.');
    }
    explanationSource = explained.explanation_source === 'azure' ? 'azure' : 'standard';
  } catch (error) {
    console.error(typeof error?.message === 'string' ? `assessment_explanation_fallback` : 'assessment_explanation_fallback');
    explanation = standardExplanation(concentrationFindings, evidenceFindings, missingDocuments);
    explanationSource = 'standard';
  }

  return {
    assessment_id: `ASM-${randomUUID()}`,
    input_snapshot: snapshot,
    evaluated_at: new Date().toISOString(),
    reference_data_version: reference.version,
    overall_status: overallStatus,
    results_by_market: resultsByMarket,
    concentration_findings: concentrationFindings,
    evidence_findings: evidenceFindings,
    missing_documents: missingDocuments,
    configuration_gaps: configurationGaps,
    metrics,
    explanation,
    explanation_source: explanationSource,
    acceptance_probability: null,
    historical_cases: relevantCases.map((item) => ({
      case_id: item.case_id,
      name: item.name,
      internal_outcome: item.internal_outcome,
      synthetic: true,
      reviewer_note: item.reviewer_note,
      findings: item.findings,
    })),
  };
}

export function listExamples(reference = loadReference()) {
  const names = new Map(reference.ingredients.map((item) => [item.ingredient_id, item.name]));
  return {
    illustrative: true,
    note: reference.examplesNote,
    formulas: reference.examples.map((formula) => ({
      ...formula,
      ingredients: formula.ingredients.map((row) => ({
        ...row,
        name: names.get(row.ingredient_id) ?? row.ingredient_id,
      })),
    })),
  };
}

export function listIngredientCatalog(reference = loadReference()) {
  return reference.ingredients.map((item) => ({
    ingredient_id: item.ingredient_id,
    name: item.name,
    cas_number: item.cas_number ?? '',
    functional_role: item.functional_role,
  }));
}
