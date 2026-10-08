import type {
  FindingRecord,
  Formula,
  MarketAssessment,
  NextActionRecord,
  ProductCategory,
  ReferenceAssessment,
  ReferenceFinding,
  ScreeningStatus,
  TargetMarket,
} from '../types/domain';

const CATEGORY_TO_API: Record<ProductCategory, string> = {
  Markers: 'water_based_marker_ink',
  Paints: 'water_based_poster_paint',
  Crayons: 'wax_crayon',
  'Modeling Compounds': 'air_dry_modeling_compound',
  Glue: 'water_based_craft_adhesive',
};

const API_TO_CATEGORY: Record<string, ProductCategory> = {
  water_based_marker_ink: 'Markers',
  water_based_poster_paint: 'Paints',
  wax_crayon: 'Crayons',
  air_dry_modeling_compound: 'Modeling Compounds',
  water_based_craft_adhesive: 'Glue',
};

const API_TO_FORM: Record<string, Formula['physicalForm']> = {
  water_based_marker_ink: 'Liquid',
  water_based_poster_paint: 'Liquid',
  wax_crayon: 'Solid stick',
  air_dry_modeling_compound: 'Paste',
  water_based_craft_adhesive: 'Gel',
};

export interface CatalogIngredient {
  ingredient_id: string;
  name: string;
  cas_number?: string;
  functional_role: string;
}

export interface ExampleFormula {
  formula_id: string;
  formula_name: string;
  product_category: string;
  target_markets: TargetMarket[];
  age_group: Formula['ageGroup'];
  composition_basis: string;
  scenario: string;
  ingredients: { ingredient_id: string; name: string; concentration_pct: number }[];
}

async function readJson(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || 'The assessment service could not be reached.');
  }
  return payload;
}

export function usesReferenceCatalog(formula: Formula) {
  return (
    formula.ingredients.length > 0 &&
    formula.ingredients.every((item) => item.catalogIngredientId?.startsWith('ING-'))
  );
}

export function formulaToAssessmentRequest(formula: Formula) {
  return {
    formula_name: formula.name,
    product_category: CATEGORY_TO_API[formula.category] ?? formula.category,
    target_markets: formula.targetMarkets,
    age_group: formula.ageGroup,
    composition_basis: 'percent_w_w',
    ingredients: formula.ingredients.map((ingredient) => ({
      ingredient_id: ingredient.catalogIngredientId ?? ingredient.rawMaterialId,
      concentration_pct: ingredient.concentration,
    })),
  };
}

export async function postAssessment(body: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch('/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new Error('The assessment service could not be reached. Check that the app is running and try again.');
  }
  return readJson(response) as Promise<ReferenceAssessment & { overall_status: ReferenceAssessment['overall_status'] }>;
}

export async function fetchExamples(signal?: AbortSignal): Promise<ExampleFormula[]> {
  let response: Response;
  try {
    response = await fetch('/api/examples', { signal });
  } catch {
    throw new Error('Reference formulas could not be loaded. Check the connection and try again.');
  }
  const payload = (await readJson(response)) as { formulas?: ExampleFormula[] };
  return payload.formulas ?? [];
}

export async function fetchCatalogIngredients(signal?: AbortSignal): Promise<CatalogIngredient[]> {
  let response: Response;
  try {
    response = await fetch('/api/ingredients', { signal });
  } catch {
    throw new Error('The reference catalog could not be loaded.');
  }
  const payload = (await readJson(response)) as { ingredients?: CatalogIngredient[] };
  return payload.ingredients ?? [];
}

export function categoryForExample(category: string): ProductCategory {
  return API_TO_CATEGORY[category] ?? 'Markers';
}

export function physicalFormForExample(category: string): Formula['physicalForm'] {
  return API_TO_FORM[category] ?? 'Liquid';
}

function screeningStatus(overall: ReferenceAssessment['overall_status']): Exclude<ScreeningStatus, 'not-screened'> {
  if (overall === 'changes_required') return 'red';
  if (overall === 'meets_reference_criteria') return 'green';
  return 'amber';
}

function marketStatus(status: string): MarketAssessment['status'] {
  if (status === 'meets_reference_criteria') return 'green';
  if (status === 'changes_required') return 'red';
  if (status === 'not_assessed') return 'not-assessed';
  return 'amber';
}

const RESULT_LABEL: Record<ReferenceFinding['result'], string> = {
  pass: 'Passed',
  fail: 'Failed',
  not_assessed: 'Not assessed',
  not_applicable: 'Not applicable',
};

function toFinding(item: ReferenceFinding, severity: FindingRecord['severity']): FindingRecord {
  const value = item.entered_value == null ? '' : ` · ${item.entered_value}${item.unit === 'percent_w_w' ? '%' : ''}`;
  return {
    id: item.check_id,
    severity,
    scope: item.ingredient_id ? 'ingredient' : 'formula',
    reference: item.ingredient_name,
    ruleId: item.check_id,
    concern: `${RESULT_LABEL[item.result]}: ${item.ingredient_name}${value}`,
    explanation: item.reason,
    evidenceReference: item.evidence_ids.length ? item.evidence_ids.join(', ') : 'None linked',
    recommendedAction: item.recommended_action,
    reviewState: 'open',
  };
}

export function mapReferenceAssessment(result: ReferenceAssessment) {
  const findings = [
    ...result.concentration_findings.map((item) =>
      toFinding(item, item.result === 'fail' ? 'high' : item.result === 'not_assessed' ? 'medium' : 'info'),
    ),
    ...result.evidence_findings.map((item) => toFinding(item, item.result === 'not_assessed' ? 'medium' : 'info')),
  ];
  const evidence = result.metrics.evidence;
  const nextActions: NextActionRecord[] = result.explanation.next_steps.slice(0, 6).map((step, index) => ({
    id: `ACT-${index + 1}`,
    kind: 'expert-review',
    label: step,
    detail: 'From the assessment explanation. Illustrative criteria are not regulatory limits.',
  }));
  const marketResults: MarketAssessment[] = result.results_by_market.map((item) => ({
    market: item.market,
    status: marketStatus(item.status),
    message: item.message,
    findingIds: findings.map((finding) => finding.id),
  }));
  const summary =
    result.explanation_source === 'azure'
      ? result.explanation.summary
      : `${result.explanation.summary} Calculated checks were kept.`;
  return {
    status: screeningStatus(result.overall_status),
    summary,
    findings,
    marketResults,
    nextActions,
    evidenceCompleteness: evidence.coverage ?? 0,
    requiredEvidenceCount: evidence.applicable,
    presentEvidenceCount: evidence.passed,
  };
}
