import type {
  AgeGroup,
  FindingRecord,
  Formula,
  MarketAssessment,
  NextActionRecord,
  PhysicalForm,
  ProductCategory,
  ScreeningStatus,
  TargetMarket,
} from '../types/domain';

export const UI_CATEGORY_TO_API: Record<ProductCategory, string> = {
  Markers: 'Markers',
  Paints: 'Paints',
  Crayons: 'Crayons',
  'Modeling Compounds': 'Modeling Compounds',
  'Future / Novelty Products': 'Future / Novelty Products',
  Glue: 'Glue',
};

const API_CATEGORY_TO_UI: Record<string, ProductCategory> = {
  Markers: 'Markers',
  Paints: 'Paints',
  Crayons: 'Crayons',
  'Modeling Compounds': 'Modeling Compounds',
  'Future / Novelty Products': 'Future / Novelty Products',
  washable_marker: 'Markers',
  paint: 'Paints',
  chalk: 'Crayons',
  glue_stick: 'Glue',
  Glue: 'Glue',
  modeling_compound: 'Modeling Compounds',
};

const UI_FORM_TO_API: Record<PhysicalForm, string> = {
  Liquid: 'liquid',
  Gel: 'gel',
  Paste: 'paste',
  'Solid stick': 'solid',
  Powder: 'powder',
};

const API_FORM_TO_UI: Record<string, PhysicalForm> = {
  liquid: 'Liquid',
  gel: 'Gel',
  paste: 'Paste',
  solid: 'Solid stick',
  powder: 'Powder',
};

export type AssessmentMode = 'evidence' | 'scenario';

export interface CatalogMaterial {
  material_id: string;
  name: string;
  kind: string;
  cas?: string | null;
  aliases?: string[];
}

export interface PackageExample {
  example_id: string;
  description: string;
  input: {
    formula_id: string;
    version_id: string;
    name: string;
    product_category: string;
    age_group: AgeGroup;
    regions: TargetMarket[];
    physical_form: string;
    intended_use: string;
    assessment_mode?: AssessmentMode;
    ingredients: { material_id: string; concentration_percent: number; batch_id: string | null }[];
  };
}

export interface PackageCheck {
  check_id: string;
  status: string;
  reason_code?: string;
  action?: string;
  priority?: string;
  criticality?: string;
  material_id: string | null;
  region: string;
  rule_id?: string | null;
  requirement_id?: string;
  document_type?: string;
  scope?: string;
  actual?: number | null;
  threshold?: number | null;
  unit?: string | null;
  basis?: string | null;
  rule_provenance?: string | null;
  verified_limit_available?: boolean;
  illustrative_comparison?: {
    rule_id?: string;
    threshold?: number;
    unit?: string;
    basis?: string;
    provenance?: string;
    within_example?: boolean;
    note?: string;
  } | null;
  message: string;
  document_ids?: string[];
  gap_status?: string;
}

export interface AnalysisConfidence {
  level: 'low' | 'medium' | 'high';
  basis: string;
  limiting_factors: string[];
  source_ids: string[];
  assessment_support?: 'insufficient' | 'partial' | 'substantial';
}

export interface AssessmentSupport {
  level: 'insufficient' | 'partial' | 'substantial';
  basis: string;
  limiting_factors: string[];
}

export interface AssessmentExecution {
  assessment_id: string;
  execution_mode: 'live' | string;
  llm_provider: 'azure_openai' | string;
  llm_status: 'succeeded' | 'failed' | 'not_requested' | string;
  deployment: string | null;
  response_id: string | null;
  request_id: string | null;
  generated_at: string;
  latency_ms: number | null;
  usage: Record<string, number | null> | null;
  retrieved_source_count: number;
  input_hash: string;
  data_hash: string;
  error_code?: string | null;
  error_message?: string | null;
}

export interface PackageAssessment {
  assessment_id: string;
  created_at: string;
  data_version: string;
  data_hash: string;
  input_hash?: string;
  input_snapshot: PackageExample['input'] & { generate_explanation?: boolean; assessment_mode?: AssessmentMode };
  screening_status: string;
  screening_status_label?: string;
  dataset_kind?: string;
  regulatory_status: 'not_assessed';
  ap_cl_decision: null;
  acceptance_probability: null;
  ap_acceptance_probability?: null;
  model_confidence: null;
  analysis_confidence?: AnalysisConfidence | null;
  assessment_support?: AssessmentSupport | null;
  assessment_mode?: AssessmentMode;
  metrics: {
    passed_checks: number;
    failed_checks: number;
    not_assessed_checks: number;
    needs_test_data_checks?: number;
    applicability_unknown_checks?: number;
    source_review_required_checks?: number;
    no_matching_rule_checks?: number;
    not_applicable_checks?: number;
    evaluated_checks?: number;
    identified_applicable_checks?: number;
    check_pass_rate_percent: number | null;
    check_pass_rate_label?: string;
    evidence_coverage_label?: string;
    concentration_passed_checks?: number;
    concentration_failed_checks?: number;
    check_pass_rate_copy?: string | null;
    rule_evaluation_coverage_percent?: number | null;
    rule_evaluation_coverage_copy?: string;
    evidence_coverage_percent: number | null;
    evidence_coverage_partial?: boolean;
    evidence_satisfied?: number;
    evidence_missing?: number;
    evidence_needs_review?: number;
    evidence_mismatched?: number;
    evidence_applicability_unknown?: number;
    evidence_not_applicable?: number;
    evidence_applicable_count?: number;
    metrics_note: string;
    ap_acceptance_note?: string;
    assessment_support?: AssessmentSupport;
  };
  regions: Record<string, { screening_status: string; regulatory_status: string; ap_cl_decision: null }>;
  explanation: {
    status: 'not_requested' | 'generated' | 'unavailable' | 'failed' | string;
    source: 'azure' | 'deterministic' | 'none' | string;
    content: {
      summary?: string;
      key_reasons?: string[];
      finding_explanations?: { check_id: string; explanation: string; source_ids?: string[]; limitations?: string[] }[];
      prioritized_actions?: {
        priority?: string;
        action: string;
        rationale?: string;
        related_check_ids?: string[];
        source_ids?: string[];
        requires_testing_or_review?: boolean;
        can_create_scenario?: boolean;
      }[];
      assessment_support_explanation?: string;
      evidence_gaps?: {
        requirement_id: string;
        status: string;
        explanation: string;
        required_action: string;
        source_ids?: string[];
      }[];
      recommendations?: {
        priority?: string;
        action: string;
        rationale?: string;
        related_check_ids?: string[];
        source_ids?: string[];
        requires_testing_or_review?: boolean;
      }[];
      alerts?: { severity?: string; title?: string; message: string; related_check_ids?: string[]; source_ids?: string[] }[];
      analysis_confidence?: AnalysisConfidence | null;
      version_comparison_summary?: string | null;
      limitations?: string[];
      version_change?: string | null;
    };
  };
  execution?: AssessmentExecution;
  llm_context: {
    checks: PackageCheck[];
    calculated_checks?: PackageCheck[];
    evidence_checks: PackageCheck[];
    documents: {
      document_id: string;
      filename: string;
      document_type: string;
      review_status?: string;
      representative_sample?: boolean;
      summary?: string;
      role?: string;
      provenance?: string;
      dataset_version?: string;
      batch_id?: string | null;
      formula_id?: string | null;
      version_id?: string | null;
      material_id?: string | null;
      supplier_id?: string | null;
      regions?: string[];
      structured_content?: Record<string, unknown>;
    }[];
    materials: { material_id: string; name: string }[];
    source_issues: { issue_id: string; severity?: string; message: string; document_ids?: string[] }[];
    source_excerpts?: {
      source_id: string;
      document_id: string;
      filename?: string;
      page?: number | null;
      relevant_text?: string;
      review_status?: string;
      applicability?: Record<string, unknown>;
    }[];
    missing_evidence?: PackageCheck[];
    assessment_limitations?: string[];
    composition_total_percent?: number;
  };
}

export function usesPackageCatalog(formula: Formula) {
  return (
    formula.ingredients.length > 0 &&
    formula.ingredients.every((item) => Boolean(item.rawMaterialId && /^[a-z][a-z0-9_]*$/.test(item.rawMaterialId)))
  );
}

export function isLiveAzureAssessment(result?: PackageAssessment) {
  return result?.execution?.llm_status === 'succeeded' && result.explanation.source === 'azure' && result.explanation.status === 'generated';
}

export function categoryForExample(category: string): ProductCategory {
  return API_CATEGORY_TO_UI[category] ?? 'Paints';
}

export function physicalFormForExample(form: string): PhysicalForm {
  return API_FORM_TO_UI[form] ?? 'Liquid';
}

async function readBody(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { message?: string; detail?: unknown };
  if (!response.ok) {
    const detail = payload.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => (item && typeof item === 'object' && 'msg' in item ? String(item.msg) : '')).filter(Boolean).join(' ')
      : typeof detail === 'string'
        ? detail
        : payload.message;
    throw new Error(message || 'The assessment service could not be reached.');
  }
  return payload;
}

export async function branchSubstanceIds(formula: Formula, signal?: AbortSignal): Promise<Set<string>> {
  const regions = formula.targetMarkets.filter((market) => market === 'US' || market === 'EU');
  if (formula.category && formula.ageGroup && regions.length > 0) {
    const params = new URLSearchParams({
      regions: regions.join(','),
      category: formula.category,
      age_group: formula.ageGroup,
    });
    try {
      const response = await fetch(`/api/reference/substances?${params}`, { signal });
      if (response.ok) {
        const body = (await response.json()) as { substances?: { substance_id: string }[] };
        return new Set((body.substances ?? []).map((item) => item.substance_id));
      }
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  const materials = await fetchPackageCatalog(signal);
  return new Set(materials.map((item) => item.material_id));
}

export function formulaToPackageRequest(
  formula: Formula,
  generateExplanation = true,
  assessmentMode: AssessmentMode = 'evidence',
  catalogIds?: Set<string>,
) {
  const resolved = catalogIds
    ? formula.ingredients.filter((ingredient) => ingredient.rawMaterialId && catalogIds.has(ingredient.rawMaterialId))
    : formula.ingredients;
  const legacy = catalogIds
    ? formula.ingredients.filter((ingredient) => !ingredient.rawMaterialId || !catalogIds.has(ingredient.rawMaterialId))
    : [];
  return {
    formula_id: formula.id,
    version_id: formula.version,
    name: formula.name,
    product_category: UI_CATEGORY_TO_API[formula.category],
    age_group: formula.ageGroup,
    regions: [...new Set(formula.targetMarkets)],
    physical_form: UI_FORM_TO_API[formula.physicalForm] ?? formula.physicalForm.toLowerCase(),
    intended_use: formula.intendedUse,
    composition_completeness: formula.compositionCompleteness ?? 'partial',
    us_states: formula.usStates ?? [],
    intended_age_detail: formula.intendedAgeDetail || null,
    toy_childcare_scope: formula.toyChildcareScope || null,
    component_type: formula.componentType || null,
    test_material_category: formula.testMaterialCategory || null,
    ingredients: resolved.map((ingredient) => ({
      material_id: ingredient.rawMaterialId,
      concentration_percent: ingredient.screeningRole === 'contaminant_analyte' ? null : ingredient.concentration,
      batch_id: ingredient.batchId?.trim() || null,
      measured_value: ingredient.measuredValue ?? null,
      measured_unit: ingredient.measuredUnit || null,
      measured_bound: ingredient.measuredBound || null,
      measurement_kind: ingredient.measurementKind || null,
      test_method: ingredient.testMethod || null,
    })),
    legacy_materials: legacy.map((ingredient) => ({
      name: ingredient.name.trim() || 'Unnamed ingredient',
      legacy_id: ingredient.rawMaterialId || null,
      concentration_percent: Number.isFinite(ingredient.concentration) ? ingredient.concentration : null,
    })),
    generate_explanation: generateExplanation,
    assessment_mode: assessmentMode,
  };
}

export async function postPackageAssessment(body: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch('/api/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new Error('The assessment service could not be reached. Start the formula backend and try again.');
  }
  return readBody(response) as Promise<PackageAssessment>;
}

export async function postComparison(previous: unknown, current: unknown, comparisonKind: 'historical' | 'reassess' = 'reassess') {
  let response: Response;
  try {
    response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ previous, current, generate_explanation: true, comparison_kind: comparisonKind }),
    });
  } catch {
    throw new Error('The comparison service could not be reached.');
  }
  return readBody(response) as Promise<{
    changes: {
      added_ingredients: { material_id: string }[];
      removed_ingredients: { material_id: string }[];
      concentration_changes: { material_id: string; previous_percent: number; current_percent: number; delta_percentage_points: number }[];
      context_changes: { field: string; previous: unknown; current: unknown }[];
      finding_changes: { check_id: string; previous_status: string | null; current_status: string | null }[];
      evidence_changes: { check_id: string; previous_status: string | null; current_status: string | null }[];
    };
    explanation: PackageAssessment['explanation'];
    comparison_kind?: string;
  }>;
}

export async function fetchPackageExamples(signal?: AbortSignal): Promise<PackageExample[]> {
  const response = await fetch('/api/examples', { signal });
  const payload = (await readBody(response)) as { examples?: PackageExample[] };
  return payload.examples ?? [];
}

export async function fetchPackageCatalog(signal?: AbortSignal): Promise<CatalogMaterial[]> {
  const response = await fetch('/api/catalog', { signal });
  const payload = (await readBody(response)) as { materials?: CatalogMaterial[] };
  return payload.materials ?? [];
}

function materialName(assessment: PackageAssessment, materialId: string | null) {
  return assessment.llm_context.materials.find((item) => item.material_id === materialId)?.name ?? materialId ?? 'Formula';
}

function screeningStatus(status: PackageAssessment['screening_status']): Exclude<ScreeningStatus, 'not-screened'> {
  if (status === 'changes_required') return 'red';
  if (status === 'no_issues_found_in_assessed_scope') return 'green';
  return 'amber';
}

function marketStatus(status: string): MarketAssessment['status'] {
  if (status === 'changes_required') return 'red';
  if (status === 'no_issues_found_in_assessed_scope') return 'green';
  if (status === 'not_assessed') return 'not-assessed';
  return 'amber';
}

export function screeningStatusCopy(status: string, mode?: string) {
  if (status === 'changes_required') return 'Changes required';
  if (status === 'no_issues_found_in_assessed_scope') {
    return mode === 'scenario' ? 'Meets configured scenario checks' : 'No issues found in assessed scope';
  }
  if (status === 'more_information_required') return 'More information required';
  return 'More information required';
}

function calculatedSummary(result: PackageAssessment) {
  const coverage = result.metrics.evidence_coverage_percent;
  const scenario = result.assessment_mode === 'scenario';
  const evidenceLabel = scenario ? 'Scenario evidence completeness' : 'Verified evidence coverage';
  return [
    `Calculated checks: ${result.metrics.passed_checks} passed, ${result.metrics.failed_checks} failed, ${result.metrics.needs_test_data_checks ?? 0} need test data, ${(result.metrics.applicability_unknown_checks ?? 0) + (result.metrics.source_review_required_checks ?? 0)} need applicability or source review.`,
    `${evidenceLabel} ${coverage == null ? 'is not available' : `${coverage}%`}.`,
    scenario
      ? 'Results use illustrative thresholds and evidence; they are not AP/CL predictions.'
      : 'AP/CL are not issued from this assessment.',
  ].join(' ');
}

export function mapPackageAssessment(result: PackageAssessment) {
  const names = new Map(result.llm_context.materials.map((item) => [item.material_id, item.name]));
  const explanations = new Map(
    (result.explanation.content.finding_explanations ?? []).map((item) => [item.check_id, item]),
  );
  const checks = result.llm_context.calculated_checks ?? result.llm_context.checks;
  const findings: FindingRecord[] = [
    ...checks.map((item) => {
      const generated = explanations.get(item.check_id);
      return {
        id: item.check_id,
        severity: item.status === 'fail' ? 'high' as const : item.status === 'pass' ? 'info' as const : 'medium' as const,
        scope: 'ingredient' as const,
        reference: `${names.get(item.material_id ?? '') ?? item.material_id} · ${item.region}`,
        ruleId: item.rule_id || item.check_id,
        concern: `${item.status === 'pass' ? 'Passed' : item.status === 'fail' ? 'Failed' : item.status === 'needs_test_data' ? 'Needs test data' : item.status === 'source_review_required' ? 'Source review required' : item.status === 'applicability_unknown' ? 'Applicability unknown' : item.status === 'no_matching_rule' ? 'No matching rule' : 'Not assessed'}: ${names.get(item.material_id ?? '') ?? item.material_id}${item.actual == null ? '' : ` · ${item.actual}`}`,
        explanation: generated?.explanation || [
          item.message,
          item.basis ? `Basis: ${item.basis}.` : '',
          item.illustrative_comparison
            ? `Illustrative comparison only: ${item.illustrative_comparison.note ?? 'not a verified limit'}.`
            : '',
        ].filter(Boolean).join(' '),
        evidenceReference: item.verified_limit_available
          ? item.rule_id || 'Verified criterion'
          : 'No verified applicable threshold available',
        recommendedAction: item.status === 'fail'
          ? 'Review this percentage against the verified applicable limit, rebalance to 100%, and reassess.'
          : item.status === 'not_assessed'
            ? 'Do not treat an illustrative or missing threshold as a regulatory verdict.'
            : 'No concentration change is indicated by this verified check.',
        reviewState: 'open' as const,
      };
    }),
    ...result.llm_context.evidence_checks
      .filter((item) => item.status !== 'not_applicable')
      .map((item) => ({
      id: item.check_id,
      severity: item.status === 'satisfied' || item.status === 'available' ? 'info' as const : 'medium' as const,
      scope: item.material_id ? 'ingredient' as const : 'formula' as const,
      reference: `${materialName(result, item.material_id)} · ${item.region}`,
      ruleId: item.check_id,
      concern: `${item.status === 'satisfied' || item.status === 'available' ? 'Satisfied' : item.status === 'needs_review' ? 'Present—awaiting review' : item.status === 'mismatched' ? 'Mismatched' : item.status === 'applicability_unknown' ? 'Applicability review needed' : 'Missing'}: ${item.document_type}`,
      explanation: explanations.get(item.check_id)?.explanation || item.message,
      evidenceReference: item.document_ids?.length ? item.document_ids.join(', ') : item.requirement_id || 'None linked',
      recommendedAction: item.action || (item.status === 'satisfied' || item.status === 'available' ? 'No further document is required for this check.' : 'Provide verified evidence for this material and batch, or finished-product scope.'),
      reviewState: 'open' as const,
    })),
  ];
  const evidence = result.llm_context.evidence_checks;
  const available = evidence.filter((item) => item.status === 'satisfied' || item.status === 'available').length;
  const live = isLiveAzureAssessment(result);
  const actionsSource = result.explanation.content.prioritized_actions ?? result.explanation.content.recommendations ?? [];
  const nextActions: NextActionRecord[] = live
    ? actionsSource.slice(0, 3).map((item, index) => ({
        id: `ACT-${index + 1}`,
        kind: 'expert-review',
        label: item.action,
        detail: item.rationale || 'From the validated Azure analysis.',
        relatedReference: item.source_ids?.join(', '),
      }))
    : (result.llm_context.missing_evidence ?? evidence.filter((item) => !['satisfied', 'available', 'not_applicable'].includes(item.status))).slice(0, 3).map((item, index) => ({
        id: `ACT-${index + 1}`,
        kind: 'request-supplier-documentation' as const,
        label: `Resolve ${item.document_type ?? item.requirement_id ?? 'evidence'} for ${item.material_id ?? 'the formula'}`,
        detail: item.message,
        relatedReference: item.requirement_id,
      }));
  const aiFailed = result.explanation.status === 'failed' || result.execution?.llm_status === 'failed';
  const summary = live
    ? result.explanation.content.summary || calculatedSummary(result)
    : `${aiFailed ? 'AI analysis failed. ' : ''}${calculatedSummary(result)}`;
  return {
    status: screeningStatus(result.screening_status),
    summary,
    findings,
    marketResults: Object.entries(result.regions).map(([market, value]) => ({
      market: market as TargetMarket,
      status: marketStatus(value.screening_status),
      message: value.screening_status === 'changes_required'
        ? 'One or more evaluated applicable checks did not pass.'
        : value.screening_status === 'no_issues_found_in_assessed_scope'
          ? 'Evaluated checks passed in the configured scope. This is not a certification.'
          : 'More information is required. Gaps or unevaluable checks remain.',
      findingIds: findings.map((finding) => finding.id),
    })),
    nextActions,
    evidenceCompleteness: result.metrics.evidence_coverage_percent ?? 0,
    requiredEvidenceCount: evidence.length,
    presentEvidenceCount: available,
  };
}
