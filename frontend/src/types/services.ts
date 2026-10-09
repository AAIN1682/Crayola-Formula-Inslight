import type {
  Ingredient,
  ActivityEvent,
  AgeGroup,
  AlertStatus,
  TargetMarket,
  AlertType,
  EvidenceDocument,
  Formula,
  FormulaLifecycle,
  LocalAttachment,
  MonitoringAlert,
  PhysicalForm,
  ProductCategory,
  RawMaterial,
  ReviewDecision,
  ReviewDecisionKind,
  ReviewStatus,
  ScreeningRun,
  ScreeningStatus,
  Submission,
  SubmissionOutcome,
} from './domain';

/* ------------------------------------------------------------------ inputs */

export interface IngredientInput {
  id?: string;
  name: string;
  rawMaterialId?: string;
  /** May be `NaN` while a user is typing; validation reports it as an error. */
  concentration: number;
  supplier?: string;
  evidenceIds?: string[];
  addedInVersion?: string;
  notes?: string;
  batchId?: string;
  compositionType?: string;
  screeningRole?: Ingredient['screeningRole'];
  needsCorrection?: boolean;
  measuredValue?: number;
  measuredUnit?: string;
  measuredBound?: string;
  measurementKind?: string;
  testMethod?: string;
}

export interface FormulaInput {
  name: string;
  category?: ProductCategory;
  ageGroup?: AgeGroup;
  targetMarkets?: TargetMarket[];
  physicalForm?: PhysicalForm;
  intendedUse: string;
  ownerId: string;
  reviewerId?: string;
  version?: string;
  description?: string;
  nextReviewDate?: string;
  lifecycle?: FormulaLifecycle;
  ingredients: IngredientInput[];
  evidenceIds: string[];
  preferredAssessmentMode?: 'evidence' | 'scenario';
  scenarioOfFormulaId?: string;
  compositionCompleteness?: 'partial' | 'complete';
  usStates?: string[];
  intendedAgeDetail?: string;
  toyChildcareScope?: string;
  componentType?: string;
  testMaterialCategory?: string;
}

export interface ReviewDecisionInput {
  formulaId: string;
  runId: string;
  decision: ReviewDecisionKind;
  note: string;
}

export interface MonitoringAlertUpdate {
  status?: AlertStatus;
  assignedToId?: string | null;
  resolutionNote?: string;
  /** Records a reassessment task against the affected formulas. */
  createReassessmentTask?: boolean;
}

export interface AttachmentInput {
  /** Attach to an existing document record. */
  documentId?: string;
  /** Or record a new document when an outstanding requirement is being fulfilled. */
  create?: {
    title: string;
    type: EvidenceDocument['type'];
    rawMaterialId?: string;
    formulaId?: string;
  };
  attachment: Omit<LocalAttachment, 'attachedBy'>;
}

/* ----------------------------------------------------------------- filters */

export type FormulaSortKey =
  | 'name'
  | 'version'
  | 'category'
  | 'ingredientCount'
  | 'screeningStatus'
  | 'reviewStatus'
  | 'owner'
  | 'updatedAt';

export type SortDirection = 'asc' | 'desc';

export interface FormulaFilters {
  query?: string;
  categories?: ProductCategory[];
  screeningStatuses?: ScreeningStatus[];
  reviewStatuses?: ReviewStatus[];
  ownerIds?: string[];
  lifecycle?: FormulaLifecycle[];
  /** Restricts to formulas whose latest run is no longer current. */
  onlyOutdated?: boolean;
  /** Restricts to formulas with at least one missing evidence requirement. */
  onlyMissingEvidence?: boolean;
  sortKey?: FormulaSortKey;
  sortDirection?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface SubmissionFilters {
  query?: string;
  categories?: ProductCategory[];
  outcomes?: SubmissionOutcome[];
  /** Rolling window in months, counted back from today. `0` means all periods. */
  periodMonths?: number;
}

export interface MonitoringFilters {
  query?: string;
  types?: AlertType[];
  statuses?: AlertStatus[];
  severities?: ('high' | 'medium' | 'low')[];
  assignedToIds?: string[];
}

export interface RawMaterialFilters {
  query?: string;
  roles?: string[];
  suppliers?: string[];
  onlyWithGaps?: boolean;
}

/* ----------------------------------------------------------------- results */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface EvidenceRequirement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  rawMaterialId?: string;
  documentType: EvidenceDocument['type'];
  satisfied: boolean;
  documentId?: string;
  documentStatus?: EvidenceDocument['status'];
  reason: string;
}

export interface FormulaEvidenceSummary {
  requirements: EvidenceRequirement[];
  requiredCount: number;
  presentCount: number;
  missingCount: number;
  completeness: number;
}

/** Row shape used by the Formula Library table — the formula plus derived columns. */
export interface FormulaRow {
  formula: Formula;
  ownerName: string;
  reviewerName: string;
  ingredientCount: number;
  missingEvidenceCount: number;
  evidenceCompleteness: number;
  mainConcern: string;
}

export interface FormulaDetail {
  formula: Formula;
  owner?: string;
  reviewer?: string;
  evidence: FormulaEvidenceSummary;
  documents: EvidenceDocument[];
  runs: ScreeningRun[];
  latestRun?: ScreeningRun;
  decisions: ReviewDecision[];
  activities: ActivityEvent[];
  linkedMaterials: RawMaterial[];
  relatedAlerts: MonitoringAlert[];
}

export interface DashboardMetric {
  key: 'total' | 'awaiting-review' | 'missing-evidence';
  label: string;
  value: number;
  caption: string;
  to: string;
  trend?: number[];
}

export interface PriorityQueueRow {
  formulaId: string;
  formulaName: string;
  version: string;
  category: ProductCategory;
  screeningStatus: ScreeningStatus;
  screeningCurrent: boolean;
  mainConcern: string;
  reviewerName: string;
  updatedAt: string;
  priority: number;
}

export interface OutcomeTrendPoint {
  period: string;
  periodStart: string;
  AP: number;
  CL: number;
  'More Data Needed': number;
  total: number;
}

export interface DashboardSummary {
  metrics: DashboardMetric[];
  statusDistribution: { status: ScreeningStatus; count: number; share: number }[];
  outcomeTrend: OutcomeTrendPoint[];
  priorityQueue: PriorityQueueRow[];
  recentActivity: ActivityEvent[];
  outdatedCount: number;
  dueForReviewCount: number;
}

export interface RawMaterialRow extends RawMaterial {
  documentCount: number;
  availableDocumentCount: number;
  evidenceCompleteness: number;
  usageCount: number;
}

export interface RawMaterialDetail {
  material: RawMaterialRow;
  documents: EvidenceDocument[];
  usedIn: { formulaId: string; formulaName: string; version: string; concentration: number }[];
  historicalUsage: { submissionId: string; formulaName: string; outcome: SubmissionOutcome; submittedAt: string }[];
  gaps: string[];
}

export type IngredientDiffKind = 'shared' | 'added' | 'removed' | 'changed';

export interface IngredientDiffRow {
  key: string;
  name: string;
  rawMaterialId?: string;
  kind: IngredientDiffKind;
  currentConcentration?: number;
  comparisonConcentration?: number;
  delta?: number;
}

export interface FormulaComparison {
  currentFormula: Formula;
  submission: Submission;
  rows: IngredientDiffRow[];
  sharedCount: number;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  overlapScore: number;
  distinctCount: number;
}

export interface MonitoringSummary {
  alerts: MonitoringAlert[];
  openCount: number;
  acknowledgedCount: number;
  resolvedCount: number;
  affectedFormulaCount: number;
  upcomingReviews: {
    formulaId: string;
    formulaName: string;
    version: string;
    dueDate: string;
    daysUntil: number;
    screeningStatus: ScreeningStatus;
  }[];
}

export interface SearchResult {
  id: string;
  kind: 'formula' | 'raw-material' | 'submission';
  title: string;
  subtitle: string;
  to: string;
}

export interface ScreeningResultView {
  run: ScreeningRun;
  formula: Formula;
  isCurrent: boolean;
  decisions: ReviewDecision[];
  ownerName: string;
}

export interface SubmissionDetail {
  submission: Submission;
  currentFormula?: Formula;
  documents: EvidenceDocument[];
}

export interface AlertDetail {
  alert: MonitoringAlert;
  affectedFormulas: Formula[];
  material?: RawMaterial;
  assigneeName?: string;
}

/** Stages reported by `runScreening` so the UI can show real progress. */
export const SCREENING_STAGES = [
  'Validate formula inputs',
  'Check illustrative rules',
  'Check exposure-data readiness',
  'Retrieve historical comparisons',
  'Prepare review summary',
] as const;

export type ScreeningStage = (typeof SCREENING_STAGES)[number];

export interface RunScreeningOptions {
  onStage?: (stage: ScreeningStage, index: number) => void;
  signal?: AbortSignal;
  assessmentMode?: 'evidence' | 'scenario';
  /** Use this record instead of the browser copy. Screening still posts it to the assessment API. */
  formula?: Formula;
  /** Leave the browser formula record unchanged. The saved assessment is still stored by the backend. */
  updateStoredFormula?: boolean;
}
