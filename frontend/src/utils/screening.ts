import type {
  DocumentType,
  EvidenceDocument,
  ExposureInputRecord,
  FindingRecord,
  Formula,
  HistoricalComparisonRecord,
  Ingredient,
  MarketAssessment,
  TargetMarket,
  MaterialRole,
  NextActionRecord,
  ProductCategory,
  RawMaterial,
  ScreeningRun,
  Severity,
  Submission,
} from '../types/domain';
import type {
  EvidenceRequirement,
  FormulaEvidenceSummary,
  IngredientDiffRow,
} from '../types/services';
import { SEVERITY_ORDER } from './formatting';
import { isTotalWithinTolerance, sumConcentrations } from './validation';
import { ageGroupLabel, sameMarkets } from './audience';
import { assessMarkets, europeanColorantLabFindings } from './markets';

/**
 * Demo screening engine.
 *
 * These are illustrative rule checks for a product demo. They are deliberately simple,
 * fully deterministic, and do not model toxicity, exposure, or any regulatory evaluation.
 */

export const DEMO_RULES = {
  DR01: { id: 'DR-01', label: 'Material routed to expert assessment' },
  DR02: { id: 'DR-02', label: 'Concentration above illustrative demo ceiling' },
  DR03: { id: 'DR-03', label: 'Ingredient not linked to the raw-material catalog' },
  DR04: { id: 'DR-04', label: 'Required supporting document missing' },
  DR05: { id: 'DR-05', label: 'Required supporting document outdated' },
  DR06: { id: 'DR-06', label: 'New ingredient without supporting evidence' },
  DR07: { id: 'DR-07', label: 'Composition total outside rounding tolerance' },
  DR08: { id: 'DR-08', label: 'Preservative system present' },
  DR09: { id: 'DR-09', label: 'No formula-level evidence linked' },
} as const;

const COA_REQUIRED_ROLES: MaterialRole[] = [
  'Colorant',
  'Opacifier',
  'Preservative',
  'Deterrent additive',
];

/** Category defaults used purely to populate the exposure-readiness panel in the demo. */
const EXPOSURE_FIXTURES: Record<
  ProductCategory,
  { contactArea: string; durationPerUse: string; usesPerWeek: string }
> = {
  Markers: { contactArea: '55', durationPerUse: '20', usesPerWeek: '6' },
  Paints: { contactArea: '180', durationPerUse: '35', usesPerWeek: '4' },
  Crayons: { contactArea: '40', durationPerUse: '25', usesPerWeek: '5' },
  'Modeling Compounds': { contactArea: '220', durationPerUse: '45', usesPerWeek: '3' },
  Glue: { contactArea: '35', durationPerUse: '10', usesPerWeek: '3' },
};

export const FIXTURE_SOURCE = 'Illustrative demo fixture — not a validated safety calculation';

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ------------------------------------------------------------- evidence */

export function requiredDocumentTypes(material: RawMaterial): DocumentType[] {
  const types: DocumentType[] = ['SDS'];
  if (COA_REQUIRED_ROLES.includes(material.role)) types.push('Certificate of Analysis');
  if (material.requiresLabReport) types.push('Laboratory Report');
  return types;
}

export function buildEvidenceRequirements(
  formula: Formula,
  rawMaterials: RawMaterial[],
  documents: EvidenceDocument[],
): EvidenceRequirement[] {
  const materialById = new Map(rawMaterials.map((material) => [material.id, material]));
  const requirements: EvidenceRequirement[] = [];

  for (const ingredient of formula.ingredients) {
    if (!ingredient.rawMaterialId) {
      requirements.push({
        id: `${ingredient.id}-unlinked`,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        documentType: 'SDS',
        satisfied: false,
        reason: 'No raw-material reference, so required documents cannot be resolved.',
      });
      continue;
    }

    const material = materialById.get(ingredient.rawMaterialId);
    if (!material) {
      requirements.push({
        id: `${ingredient.id}-unknown`,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        rawMaterialId: ingredient.rawMaterialId,
        documentType: 'SDS',
        satisfied: false,
        reason: `Raw material ${ingredient.rawMaterialId} is not in the catalog.`,
      });
      continue;
    }

    for (const documentType of requiredDocumentTypes(material)) {
      const document = documents.find(
        (candidate) => candidate.rawMaterialId === material.id && candidate.type === documentType,
      );
      const satisfied = document?.status === 'available';
      requirements.push({
        id: `${ingredient.id}-${slug(documentType)}`,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        rawMaterialId: material.id,
        documentType,
        satisfied,
        documentId: document?.id,
        documentStatus: document?.status ?? 'missing',
        reason: satisfied
          ? `${documentType} on file from ${material.supplier}.`
          : document
            ? `${documentType} from ${material.supplier} is ${document.status}.`
            : `${documentType} from ${material.supplier} has not been received.`,
      });
    }
  }

  return requirements;
}

export function summarizeEvidence(
  formula: Formula,
  rawMaterials: RawMaterial[],
  documents: EvidenceDocument[],
): FormulaEvidenceSummary {
  const requirements = buildEvidenceRequirements(formula, rawMaterials, documents);
  const requiredCount = requirements.length;
  const presentCount = requirements.filter((requirement) => requirement.satisfied).length;
  const missingCount = requiredCount - presentCount;
  const completeness = requiredCount === 0 ? 0 : Math.round((presentCount / requiredCount) * 100);
  return { requirements, requiredCount, presentCount, missingCount, completeness };
}

/* ------------------------------------------------------------ comparison */

type DiffIngredient = { name: string; rawMaterialId?: string; concentration: number; batchId?: string };

function diffKey(ingredient: DiffIngredient): string {
  return ingredient.rawMaterialId ?? ingredient.name.trim().toLowerCase();
}

export function diffIngredients(
  current: DiffIngredient[],
  comparison: DiffIngredient[],
): IngredientDiffRow[] {
  const currentByKey = new Map(current.map((item) => [diffKey(item), item]));
  const comparisonByKey = new Map(comparison.map((item) => [diffKey(item), item]));
  const keys = Array.from(new Set([...currentByKey.keys(), ...comparisonByKey.keys()]));

  const rows: IngredientDiffRow[] = keys.map((key) => {
    const currentItem = currentByKey.get(key);
    const comparisonItem = comparisonByKey.get(key);
    const name = currentItem?.name ?? comparisonItem?.name ?? key;
    const rawMaterialId = currentItem?.rawMaterialId ?? comparisonItem?.rawMaterialId;

    if (currentItem && !comparisonItem) {
      return { key, name, rawMaterialId, kind: 'added', currentConcentration: currentItem.concentration };
    }
    if (!currentItem && comparisonItem) {
      return {
        key,
        name,
        rawMaterialId,
        kind: 'removed',
        comparisonConcentration: comparisonItem.concentration,
      };
    }

    const currentConcentration = currentItem?.concentration ?? 0;
    const comparisonConcentration = comparisonItem?.concentration ?? 0;
    const delta = Math.round((currentConcentration - comparisonConcentration) * 1000) / 1000;
    return {
      key,
      name,
      rawMaterialId,
      kind: Math.abs(delta) >= 0.05 ? 'changed' : 'shared',
      currentConcentration,
      comparisonConcentration,
      delta,
    };
  });

  const order: Record<IngredientDiffRow['kind'], number> = { added: 0, removed: 1, changed: 2, shared: 3 };
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

/**
 * Demo ingredient-overlap score: shared raw materials ÷ distinct raw materials across
 * both records. It describes composition overlap only — it says nothing about whether a
 * formula would be accepted.
 */
export function overlapScore(
  current: DiffIngredient[],
  comparison: DiffIngredient[],
): { score: number; sharedCount: number; distinctCount: number } {
  const currentKeys = new Set(current.map(diffKey));
  const comparisonKeys = new Set(comparison.map(diffKey));
  const distinct = new Set([...currentKeys, ...comparisonKeys]);
  let shared = 0;
  for (const key of currentKeys) if (comparisonKeys.has(key)) shared += 1;
  const distinctCount = distinct.size;
  return {
    score: distinctCount === 0 ? 0 : Math.round((shared / distinctCount) * 100),
    sharedCount: shared,
    distinctCount,
  };
}

function describeDifferences(rows: IngredientDiffRow[]): string[] {
  const differences: string[] = [];
  const added = rows.filter((row) => row.kind === 'added');
  const removed = rows.filter((row) => row.kind === 'removed');
  const changed = rows.filter((row) => row.kind === 'changed');

  if (added.length > 0) {
    differences.push(`Only in the current formula: ${added.map((row) => row.name).join(', ')}`);
  }
  if (removed.length > 0) {
    differences.push(`Only in the historical record: ${removed.map((row) => row.name).join(', ')}`);
  }
  for (const row of changed.slice(0, 3)) {
    differences.push(
      `${row.name}: ${row.comparisonConcentration}% → ${row.currentConcentration}% (${
        (row.delta ?? 0) > 0 ? '+' : ''
      }${row.delta}%)`,
    );
  }
  if (differences.length === 0) differences.push('No ingredient-level differences recorded.');
  return differences;
}

export function buildComparisons(
  formula: Formula,
  submissions: Submission[],
  limit = 3,
): HistoricalComparisonRecord[] {
  return submissions
    .filter((submission) => submission.formulaId !== formula.id || submission.version !== formula.version)
    .map((submission) => {
      const { score, sharedCount, distinctCount } = overlapScore(formula.ingredients, submission.snapshot);
      const rows = diffIngredients(formula.ingredients, submission.snapshot);
      return {
        submissionId: submission.id,
        formulaId: submission.formulaId,
        formulaName: submission.formulaName,
        version: submission.version,
        outcome: submission.outcome,
        overlapScore: score,
        sharedCount,
        distinctCount,
        keyDifferences: describeDifferences(rows),
      } satisfies HistoricalComparisonRecord;
    })
    .filter((comparison) => comparison.sharedCount >= 2)
    .sort((a, b) => b.overlapScore - a.overlapScore || a.submissionId.localeCompare(b.submissionId))
    .slice(0, limit);
}

/* -------------------------------------------------------------- screening */

export interface ScreeningContext {
  formula: Formula;
  rawMaterials: RawMaterial[];
  documents: EvidenceDocument[];
  submissions: Submission[];
}

export interface ScreeningComputation {
  status: 'green' | 'amber' | 'red';
  summary: string;
  findings: FindingRecord[];
  exposureInputs: ExposureInputRecord[];
  comparisons: HistoricalComparisonRecord[];
  nextActions: NextActionRecord[];
  evidence: FormulaEvidenceSummary;
  marketResults: MarketAssessment[];
}

function buildExposureInputs(
  formula: Formula,
  requirements: EvidenceRequirement[],
  rawMaterials: RawMaterial[],
): ExposureInputRecord[] {
  const fixture = EXPOSURE_FIXTURES[formula.category];
  const materialById = new Map(rawMaterials.map((material) => [material.id, material]));

  const coaRequirements = requirements.filter(
    (requirement) => requirement.documentType === 'Certificate of Analysis',
  );
  const coaSatisfied = coaRequirements.every((requirement) => requirement.satisfied);

  const labRequirements = requirements.filter(
    (requirement) => requirement.documentType === 'Laboratory Report',
  );
  const labSatisfied = labRequirements.every((item) => item.satisfied);

  const NOT_REQUIRED = 'Not required by the demo rule checks for this composition';

  const hasExpertMaterial = formula.ingredients.some((ingredient) => {
    const material = ingredient.rawMaterialId ? materialById.get(ingredient.rawMaterialId) : undefined;
    return material?.requiresExpertAssessment === true;
  });

  const total = sumConcentrations(formula.ingredients);

  return [
    {
      key: 'age-group',
      label: 'Intended age group',
      unit: 'years',
      available: Boolean(formula.ageGroup),
      value: ageGroupLabel(formula.ageGroup),
      source: 'Formula record',
    },
    {
      key: 'physical-form',
      label: 'Physical form',
      unit: '—',
      available: Boolean(formula.physicalForm),
      value: formula.physicalForm,
      source: 'Formula record',
    },
    {
      key: 'composition-balance',
      label: 'Composition total',
      unit: '%',
      available: isTotalWithinTolerance(total),
      value: `${total}`,
      source: 'Formula record',
    },
    {
      key: 'contact-area',
      label: 'Assumed skin-contact area',
      unit: 'cm²',
      available: true,
      value: fixture.contactArea,
      source: FIXTURE_SOURCE,
    },
    {
      key: 'duration-per-use',
      label: 'Assumed duration per use',
      unit: 'minutes',
      available: true,
      value: fixture.durationPerUse,
      source: FIXTURE_SOURCE,
    },
    {
      key: 'uses-per-week',
      label: 'Assumed frequency of use',
      unit: 'uses/week',
      available: true,
      value: fixture.usesPerWeek,
      source: FIXTURE_SOURCE,
    },
    {
      key: 'ingestion-scenario',
      label: 'Incidental ingestion input',
      unit: 'mg/event',
      available: coaSatisfied,
      value: coaRequirements.length === 0 ? 'Not applicable' : coaSatisfied ? '12' : undefined,
      source:
        coaRequirements.length === 0
          ? NOT_REQUIRED
          : coaSatisfied
            ? `${FIXTURE_SOURCE}, anchored to the certificates of analysis on file`
            : 'Blocked — certificate of analysis missing for one or more materials',
    },
    {
      key: 'migration-result',
      label: 'Migration test input',
      unit: 'mg/kg',
      available: labSatisfied,
      value: labRequirements.length === 0 ? 'Not applicable' : labSatisfied ? '0.8' : undefined,
      source:
        labRequirements.length === 0
          ? NOT_REQUIRED
          : labSatisfied
            ? 'Laboratory report on file'
            : 'Blocked — laboratory report not received',
    },
    {
      key: 'expert-input',
      label: 'Expert assessment input',
      unit: '—',
      available: !hasExpertMaterial,
      value: hasExpertMaterial ? undefined : 'No expert-assessment material in composition',
      source: hasExpertMaterial
        ? 'Blocked — a material in this formula is routed to expert assessment'
        : 'Demo rule checks',
    },
  ];
}

export function computeScreening(context: ScreeningContext): ScreeningComputation {
  const { formula, rawMaterials, documents, submissions } = context;
  const materialById = new Map(rawMaterials.map((material) => [material.id, material]));
  const evidence = summarizeEvidence(formula, rawMaterials, documents);
  let findings: FindingRecord[] = [];
  const nextActions: NextActionRecord[] = [];

  const pushAction = (action: NextActionRecord) => {
    if (!nextActions.some((existing) => existing.id === action.id)) nextActions.push(action);
  };

  /* DR-01 / DR-02 / DR-03 / DR-06 — ingredient level checks */
  for (const ingredient of formula.ingredients) {
    if (!ingredient.rawMaterialId) {
      findings.push({
        id: `${DEMO_RULES.DR03.id}-${slug(ingredient.name)}`,
        ruleId: DEMO_RULES.DR03.id,
        severity: 'medium',
        scope: 'ingredient',
        reference: ingredient.name,
        concern: 'Ingredient is not linked to the raw-material catalog',
        explanation:
          'Without a raw-material reference the demo checks cannot resolve which supporting documents are required, so the assessment inputs stay incomplete.',
        evidenceReference: 'No linked records',
        recommendedAction: 'Link the ingredient to a catalog material, or add the material first.',
        reviewState: 'open',
      });
      pushAction({
        id: `complete-${slug(ingredient.name)}`,
        kind: 'complete-formula-record',
        label: `Link "${ingredient.name}" to a catalog material`,
        detail:
          'Completing the raw-material reference lets the demo checks resolve required documents for this ingredient.',
        relatedReference: ingredient.name,
      });
      continue;
    }

    const material = materialById.get(ingredient.rawMaterialId);
    if (!material) continue;

    if (material.requiresExpertAssessment) {
      findings.push({
        id: `${DEMO_RULES.DR01.id}-${slug(material.id)}`,
        ruleId: DEMO_RULES.DR01.id,
        severity: 'high',
        scope: 'ingredient',
        reference: `${ingredient.name} (${material.id})`,
        concern: 'Material is routed to expert assessment by the demo rule set',
        explanation: `${material.name} is marked in this demo workspace as requiring a specialist opinion before the formula progresses. ${material.usageNote}`,
        evidenceReference: `${material.id} · ${material.supplier}`,
        recommendedAction:
          'Ask a product safety specialist to assess this material at the proposed concentration.',
        reviewState: 'open',
      });
      pushAction({
        id: `expert-${slug(material.id)}`,
        kind: 'expert-review',
        label: `Ask an expert to review ${material.name}`,
        detail:
          'A specialist opinion is required before the internal review can be marked complete for this formula.',
        relatedReference: material.id,
      });
    }

    if (
      material.demoConcentrationCeiling !== undefined &&
      ingredient.concentration > material.demoConcentrationCeiling
    ) {
      const ratio = ingredient.concentration / material.demoConcentrationCeiling;
      const severity: Severity = ratio > 1.5 ? 'high' : 'medium';
      findings.push({
        id: `${DEMO_RULES.DR02.id}-${slug(material.id)}`,
        ruleId: DEMO_RULES.DR02.id,
        severity,
        scope: 'ingredient',
        reference: `${ingredient.name} (${material.id})`,
        concern: `Concentration ${ingredient.concentration}% is above the illustrative demo ceiling of ${material.demoConcentrationCeiling}%`,
        explanation:
          'The ceiling is an internal demo threshold used to route formulations to a reviewer. It is not a regulatory limit and does not describe a safe or unsafe level.',
        evidenceReference: `${material.id} · demo ceiling ${material.demoConcentrationCeiling}%`,
        recommendedAction:
          'Confirm the intended concentration with the formulation owner, or record the rationale for exceeding the demo ceiling.',
        reviewState: 'open',
      });
      pushAction({
        id: `expert-ceiling-${slug(material.id)}`,
        kind: 'expert-review',
        label: `Review the loading of ${material.name}`,
        detail: `The recorded concentration of ${ingredient.concentration}% exceeds the illustrative demo ceiling of ${material.demoConcentrationCeiling}%.`,
        relatedReference: material.id,
      });
    }

    const isNewIngredient =
      ingredient.addedInVersion !== undefined && ingredient.addedInVersion === formula.version;
    const ingredientDocuments = documents.filter(
      (document) => document.rawMaterialId === material.id && document.status === 'available',
    );
    if (isNewIngredient && ingredientDocuments.length === 0) {
      findings.push({
        id: `${DEMO_RULES.DR06.id}-${slug(material.id)}`,
        ruleId: DEMO_RULES.DR06.id,
        severity: 'medium',
        scope: 'ingredient',
        reference: `${ingredient.name} (${material.id})`,
        concern: `New in ${formula.version} with no supporting documents on file`,
        explanation:
          'This ingredient was introduced in the current version and has no available supporting documents, so the demo checks cannot assess it.',
        evidenceReference: 'No available documents',
        recommendedAction: `Request supporting documentation from ${material.supplier} before review.`,
        reviewState: 'open',
      });
    }
  }

  /* DR-04 / DR-05 — evidence requirements */
  const missingRequirements = evidence.requirements.filter((requirement) => !requirement.satisfied);
  for (const requirement of missingRequirements) {
    if (!requirement.rawMaterialId) continue;
    const material = materialById.get(requirement.rawMaterialId);
    const outdated = requirement.documentStatus === 'outdated';
    findings.push({
      id: `${outdated ? DEMO_RULES.DR05.id : DEMO_RULES.DR04.id}-${requirement.id}`,
      ruleId: outdated ? DEMO_RULES.DR05.id : DEMO_RULES.DR04.id,
      severity: 'medium',
      scope: 'ingredient',
      reference: `${requirement.ingredientName} (${requirement.rawMaterialId})`,
      concern: outdated
        ? `${requirement.documentType} on file is marked outdated`
        : `${requirement.documentType} is not on file`,
      explanation: outdated
        ? 'The document exists in the demo workspace but is superseded, so it is not counted towards evidence completeness.'
        : 'A required supporting document is absent, so the demo checks treat the assessment inputs as incomplete.',
      evidenceReference: requirement.documentId
        ? `${requirement.documentId} · ${requirement.documentStatus}`
        : `${requirement.documentType} — not received`,
      recommendedAction: outdated
        ? `Request the current ${requirement.documentType} from ${material?.supplier ?? 'the supplier'}.`
        : `Request the ${requirement.documentType} from ${material?.supplier ?? 'the supplier'}.`,
      reviewState: 'open',
    });

    if (requirement.documentType === 'Laboratory Report') {
      pushAction({
        id: `lab-${slug(requirement.rawMaterialId)}`,
        kind: 'add-laboratory-evidence',
        label: `Add laboratory evidence for ${material?.name ?? requirement.rawMaterialId}`,
        detail: 'The demo checks require a laboratory report for this material before evidence is complete.',
        relatedReference: requirement.rawMaterialId,
      });
    } else {
      pushAction({
        id: `supplier-${slug(requirement.rawMaterialId)}-${slug(requirement.documentType)}`,
        kind: 'request-supplier-documentation',
        label: `Request ${requirement.documentType} from ${material?.supplier ?? 'the supplier'}`,
        detail: `Covers ${material?.name ?? requirement.rawMaterialId} used in ${requirement.ingredientName}.`,
        relatedReference: requirement.rawMaterialId,
      });
    }
  }

  /* DR-07 — composition balance */
  const total = sumConcentrations(formula.ingredients);
  if (formula.ingredients.length > 0 && !isTotalWithinTolerance(total)) {
    findings.push({
      id: `${DEMO_RULES.DR07.id}-total`,
      ruleId: DEMO_RULES.DR07.id,
      severity: 'medium',
      scope: 'formula',
      reference: formula.id,
      concern: `Concentrations total ${total}% rather than 100%`,
      explanation:
        'An unbalanced composition means the recorded formula is incomplete, so downstream assessment inputs cannot be trusted.',
      evidenceReference: 'Formula record',
      recommendedAction: 'Correct the ingredient concentrations so they total 100% within ±0.5%.',
      reviewState: 'open',
    });
    pushAction({
      id: 'complete-composition',
      kind: 'complete-formula-record',
      label: 'Balance the composition to 100%',
      detail: `The recorded concentrations currently total ${total}%.`,
    });
  }

  /* DR-08 — informational */
  const preservatives = formula.ingredients.filter((ingredient) => {
    const material = ingredient.rawMaterialId ? materialById.get(ingredient.rawMaterialId) : undefined;
    return material?.role === 'Preservative';
  });
  if (preservatives.length > 0) {
    findings.push({
      id: `${DEMO_RULES.DR08.id}-preservative`,
      ruleId: DEMO_RULES.DR08.id,
      severity: 'info',
      scope: 'formula',
      reference: formula.id,
      concern: 'Preservative system present in the composition',
      explanation: `${preservatives
        .map((ingredient) => ingredient.name)
        .join(', ')} ${preservatives.length === 1 ? 'is' : 'are'} recorded in this formula. Noted so the reviewer can confirm the preservative documentation set is complete.`,
      evidenceReference: preservatives
        .map((ingredient) => ingredient.rawMaterialId)
        .filter(Boolean)
        .join(', '),
      recommendedAction: 'No action required unless the reviewer needs additional preservative data.',
      reviewState: 'open',
    });
  }

  /* DR-09 — formula-level evidence */
  if (formula.evidenceIds.length === 0) {
    findings.push({
      id: `${DEMO_RULES.DR09.id}-formula`,
      ruleId: DEMO_RULES.DR09.id,
      severity: 'low',
      scope: 'formula',
      reference: formula.id,
      concern: 'No formula-level evidence linked',
      explanation:
        'Formula-level documents such as laboratory reports or correspondence help a reviewer follow the reasoning behind the composition.',
      evidenceReference: 'Formula record',
      recommendedAction: 'Link at least one formula-level document on the Evidence tab.',
      reviewState: 'open',
    });
  }

  const comparisons = buildComparisons(formula, submissions);

  /* Alternatives are framed as candidates that still need their own assessment. */
  const highFindings = findings.filter((finding) => finding.severity === 'high');
  if (highFindings.length > 0) {
    const currentKeys = new Set(formula.ingredients.map((ingredient) => diffKey(ingredient)));
    const acceptedComparison = comparisons.find((comparison) => comparison.outcome === 'AP');
    if (acceptedComparison) {
      const submission = submissions.find((item) => item.id === acceptedComparison.submissionId);
      const candidate = submission?.snapshot.find((item) => !currentKeys.has(diffKey(item)));
      if (candidate) {
        pushAction({
          id: `alternative-${slug(candidate.name)}`,
          kind: 'review-alternative',
          label: `Review ${candidate.name} as a candidate`,
          detail: `Used in ${submission?.formulaName} ${submission?.version}, a historically accepted demo formula. Any alternative must be assessed again in this formula — prior use does not carry over.`,
          relatedReference: candidate.rawMaterialId,
        });
      }
    }
  }

  const exposureInputs = buildExposureInputs(formula, evidence.requirements, rawMaterials);
  const unavailableInputs = exposureInputs.filter((input) => !input.available);

  findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
  );

  let status: 'green' | 'amber' | 'red';
  if (findings.some((finding) => finding.severity === 'high')) {
    status = 'red';
  } else if (
    findings.some((finding) => finding.severity === 'medium') ||
    evidence.missingCount > 0 ||
    unavailableInputs.length > 0
  ) {
    status = 'amber';
  } else {
    status = 'green';
  }

  const selectedMarkets: TargetMarket[] = formula.targetMarkets?.length ? formula.targetMarkets : ['US'];
  const euFindings = selectedMarkets.includes('EU')
    ? europeanColorantLabFindings(formula, rawMaterials, documents)
    : [];
  const marketAssessment = assessMarkets(selectedMarkets, findings, { EU: euFindings }, status);
  const marketResults = marketAssessment.results;
  const usOnly = selectedMarkets.length === 1 && selectedMarkets[0] === 'US';
  if (!usOnly) {
    status = marketAssessment.status;
    findings = marketAssessment.applicableFindings;
  }

  const summary = buildSummary({
    status,
    highCount: findings.filter((finding) => finding.severity === 'high').length,
    mediumCount: findings.filter((finding) => finding.severity === 'medium').length,
    evidence,
    unavailableInputCount: unavailableInputs.length,
  });

  const actionOrder: Record<NextActionRecord['kind'], number> = {
    'expert-review': 0,
    'request-supplier-documentation': 1,
    'add-laboratory-evidence': 2,
    'complete-formula-record': 3,
    'review-alternative': 4,
  };
  nextActions.sort((a, b) => actionOrder[a.kind] - actionOrder[b.kind] || a.label.localeCompare(b.label));

  return { status, summary, findings, exposureInputs, comparisons, nextActions, evidence, marketResults };
}

function buildSummary(args: {
  status: 'green' | 'amber' | 'red';
  highCount: number;
  mediumCount: number;
  evidence: FormulaEvidenceSummary;
  unavailableInputCount: number;
}): string {
  const { status, highCount, mediumCount, evidence, unavailableInputCount } = args;
  const evidencePart =
    evidence.requiredCount === 0
      ? 'No supporting documents are required by the demo checks for this composition.'
      : `${evidence.presentCount} of ${evidence.requiredCount} required supporting documents are on file.`;

  if (status === 'red') {
    return `The demo rule checks raised ${highCount} high-priority ${
      highCount === 1 ? 'concern' : 'concerns'
    } that need an expert assessment before this formula moves forward. ${evidencePart}`;
  }

  if (status === 'amber') {
    const parts: string[] = [];
    if (mediumCount > 0) {
      parts.push(`${mediumCount} ${mediumCount === 1 ? 'item needs' : 'items need'} reviewer attention`);
    }
    if (evidence.missingCount > 0) {
      parts.push(
        `${evidence.missingCount} required ${evidence.missingCount === 1 ? 'document is' : 'documents are'} missing or outdated`,
      );
    }
    if (unavailableInputCount > 0) {
      parts.push(
        `${unavailableInputCount} exposure ${unavailableInputCount === 1 ? 'input is' : 'inputs are'} not assessed`,
      );
    }
    return `No high-priority concern was raised, but ${parts.join(', ')}. ${evidencePart}`;
  }

  return `The demo rule checks found no open concerns and all required supporting documents are present. ${evidencePart} This is an internal screening result, not an ACMI certification.`;
}

/* -------------------------------------------------------------- currency */

export function ingredientSignature(ingredients: DiffIngredient[]): string {
  return ingredients
    .map((ingredient) => `${diffKey(ingredient)}@${ingredient.concentration}@${ingredient.batchId ?? ''}`)
    .sort()
    .join('|');
}

/** A run stops being current as soon as the version or the composition changes. */
export function isRunCurrent(formula: Formula, run: ScreeningRun | undefined): boolean {
  if (!run) return false;
  if (run.legacySample) return false;
  if (run.formulaVersion !== formula.version) return false;
  if (run.ageGroup && run.ageGroup !== formula.ageGroup) return false;
  if (run.targetMarkets && !sameMarkets(run.targetMarkets, formula.targetMarkets)) return false;
  if (run.physicalForm && run.physicalForm !== formula.physicalForm) return false;
  if (run.intendedUse && run.intendedUse !== formula.intendedUse) return false;
  if (run.category && run.category !== formula.category) return false;
  return ingredientSignature(formula.ingredients) === ingredientSignature(run.ingredientSnapshot);
}

export function snapshotIngredients(ingredients: Ingredient[]) {
  return ingredients.map((ingredient) => ({
    name: ingredient.name,
    rawMaterialId: ingredient.rawMaterialId,
    concentration: ingredient.concentration,
    batchId: ingredient.batchId,
  }));
}

/** Short phrase used in the priority queue and alert copy. */
export function mainConcernFor(formula: Formula, run?: ScreeningRun): string {
  if (!run) return 'Not screened yet';
  if (run.outdated) return 'Formula changed since last screening';
  const high = run.findings.find((finding) => finding.severity === 'high');
  if (high) return high.concern;
  const medium = run.findings.find((finding) => finding.severity === 'medium');
  if (medium) return medium.concern;
  if (formula.reviewStatus === 'awaiting-evidence') return 'Awaiting requested evidence';
  return 'No open concerns from the demo checks';
}
