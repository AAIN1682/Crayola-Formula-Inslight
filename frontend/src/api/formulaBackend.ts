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
  Markers: 'washable_marker',
  Paints: 'paint',
  Crayons: 'chalk',
  Glue: 'glue_stick',
  'Modeling Compounds': 'modeling_compound',
};

const API_CATEGORY_TO_UI: Record<string, ProductCategory> = {
  washable_marker: 'Markers',
  paint: 'Paints',
  chalk: 'Crayons',
  glue_stick: 'Glue',
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

export interface CatalogMaterial {
  material_id: string;
  name: string;
  kind: string;
  cas?: string | null;
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
    ingredients: { material_id: string; concentration_percent: number; batch_id: string | null }[];
  };
}

export interface PackageCheck {
  check_id: string;
  status: 'pass' | 'fail' | 'not_assessed' | 'available' | 'needs_review' | 'missing';
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
  input_snapshot: PackageExample['input'] & { generate_explanation?: boolean };
  screening_status: 'changes_required' | 'review_required' | 'not_assessed';
  regulatory_status: 'not_assessed';
  ap_cl_decision: null;
  acceptance_probability: null;
  ap_acceptance_probability?: null;
  model_confidence: null;
  analysis_confidence?: AnalysisConfidence | null;
  metrics: {
    passed_checks: number;
    failed_checks: number;
    not_assessed_checks: number;
    check_pass_rate_percent: number | null;
    evidence_coverage_percent: number | null;
    metrics_note: string;
  };
  regions: Record<string, { screening_status: string; regulatory_status: string; ap_cl_decision: null }>;
  explanation: {
    status: 'not_requested' | 'generated' | 'unavailable' | 'failed' | string;
    source: 'azure' | 'deterministic' | 'none' | string;
    content: {
      summary?: string;
      finding_explanations?: { check_id: string; explanation: string; source_ids?: string[]; limitations?: string[] }[];
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
    documents: { document_id: string; filename: string; document_type: string; review_status?: string; representative_sample?: boolean }[];
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

export function formulaToPackageRequest(formula: Formula, generateExplanation = true) {
  return {
    formula_id: formula.id,
    version_id: formula.version,
    name: formula.name,
    product_category: UI_CATEGORY_TO_API[formula.category],
    age_group: formula.ageGroup,
    regions: [...new Set(formula.targetMarkets)],
    physical_form: UI_FORM_TO_API[formula.physicalForm] ?? formula.physicalForm.toLowerCase(),
    intended_use: formula.intendedUse,
    ingredients: formula.ingredients.map((ingredient) => ({
      material_id: ingredient.rawMaterialId,
      concentration_percent: ingredient.concentration,
      batch_id: ingredient.batchId?.trim() || null,
    })),
    generate_explanation: generateExplanation,
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

export async function postComparison(previous: unknown, current: unknown) {
  let response: Response;
  try {
    response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ previous, current, generate_explanation: true }),
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
  return 'amber';
}

function marketStatus(status: string): MarketAssessment['status'] {
  if (status === 'changes_required') return 'red';
  if (status === 'not_assessed') return 'not-assessed';
  return 'amber';
}

function calculatedSummary(result: PackageAssessment) {
  const coverage = result.metrics.evidence_coverage_percent;
  return [
    `Calculated checks: ${result.metrics.passed_checks} passed, ${result.metrics.failed_checks} failed, ${result.metrics.not_assessed_checks} not assessed.`,
    `Verified evidence coverage ${coverage == null ? 'is not available' : `${coverage}%`}.`,
    'AP/CL are not issued from this assessment.',
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
        severity: item.status === 'fail' ? 'high' as const : item.status === 'not_assessed' ? 'medium' as const : 'info' as const,
        scope: 'ingredient' as const,
        reference: `${names.get(item.material_id ?? '') ?? item.material_id} · ${item.region}`,
        ruleId: item.rule_id || item.check_id,
        concern: `${item.status === 'pass' ? 'Passed' : item.status === 'fail' ? 'Failed' : 'Not assessed'}: ${names.get(item.material_id ?? '') ?? item.material_id}${item.actual == null ? '' : ` · ${item.actual}%`}`,
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
    ...result.llm_context.evidence_checks.map((item) => ({
      id: item.check_id,
      severity: item.status === 'available' ? 'info' as const : 'medium' as const,
      scope: item.material_id ? 'ingredient' as const : 'formula' as const,
      reference: `${materialName(result, item.material_id)} · ${item.region}`,
      ruleId: item.check_id,
      concern: `${item.status === 'available' ? 'Available' : item.status === 'needs_review' ? 'Needs review' : 'Missing'}: ${item.document_type}`,
      explanation: explanations.get(item.check_id)?.explanation || item.message,
      evidenceReference: item.document_ids?.length ? item.document_ids.join(', ') : item.requirement_id || 'None linked',
      recommendedAction: item.status === 'available' ? 'No further document is required for this check.' : 'Provide verified evidence for this material, batch, or formula version.',
      reviewState: 'open' as const,
    })),
  ];
  const evidence = result.llm_context.evidence_checks;
  const available = evidence.filter((item) => item.status === 'available').length;
  const live = isLiveAzureAssessment(result);
  const nextActions: NextActionRecord[] = live
    ? (result.explanation.content.recommendations ?? []).map((item, index) => ({
        id: `ACT-${index + 1}`,
        kind: 'expert-review',
        label: item.action,
        detail: item.rationale || 'From the validated Azure analysis.',
        relatedReference: item.source_ids?.join(', '),
      }))
    : (result.llm_context.missing_evidence ?? evidence.filter((item) => item.status !== 'available')).slice(0, 5).map((item, index) => ({
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
      message: value.screening_status === 'not_assessed'
        ? 'Not assessed. No verified applicable threshold is available for this region.'
        : value.screening_status === 'changes_required'
          ? 'One or more verified applicable checks did not pass.'
          : 'Review required. This is not a certification outcome.',
      findingIds: findings.map((finding) => finding.id),
    })),
    nextActions,
    evidenceCompleteness: result.metrics.evidence_coverage_percent ?? 0,
    requiredEvidenceCount: evidence.length,
    presentEvidenceCount: available,
  };
}
