/**
 * Domain model for the Formula Insight demo workspace.
 *
 * Everything in this file describes synthetic, illustrative records. Nothing here
 * represents a regulatory decision, a validated safety calculation, or an external
 * certification outcome.
 */

export type ProductCategory = 'Markers' | 'Paints' | 'Crayons' | 'Modeling Compounds' | 'Glue';

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Markers',
  'Paints',
  'Crayons',
  'Modeling Compounds',
  'Glue',
];

export type PhysicalForm = 'Liquid' | 'Gel' | 'Paste' | 'Solid stick' | 'Powder';

export const PHYSICAL_FORMS: PhysicalForm[] = ['Liquid', 'Gel', 'Paste', 'Solid stick', 'Powder'];

export type AgeGroup = '3+' | '4+' | '6+' | '8+' | '12+';

export const AGE_GROUPS: AgeGroup[] = ['3+', '4+', '6+', '8+', '12+'];

/** Internal screening outcome produced by the demo rule checks. Never an external certification. */
export type ScreeningStatus = 'green' | 'amber' | 'red' | 'not-screened';

/** Internal review state tracked by the product safety team. */
export type ReviewStatus = 'not-started' | 'in-review' | 'awaiting-evidence' | 'complete' | 'returned';

/** Recorded outcome of a *historical* external submission. Distinct from screening status. */
export type SubmissionOutcome = 'AP' | 'CL' | 'More Data Needed';

export type FormulaLifecycle = 'draft' | 'active' | 'archived';

export type Severity = 'high' | 'medium' | 'low' | 'info';

export type DocumentType =
  | 'SDS'
  | 'Certificate of Analysis'
  | 'Laboratory Report'
  | 'Correspondence';

export const DOCUMENT_TYPES: DocumentType[] = [
  'SDS',
  'Certificate of Analysis',
  'Laboratory Report',
  'Correspondence',
];

export type DocumentStatus = 'available' | 'missing' | 'outdated' | 'requested';

export type MaterialRole =
  | 'Colorant'
  | 'Binder'
  | 'Surfactant'
  | 'Preservative'
  | 'Carrier'
  | 'Humectant'
  | 'Filler'
  | 'Rheology modifier'
  | 'Processing aid'
  | 'pH adjuster'
  | 'Deterrent additive'
  | 'Opacifier'
  | 'Structuring agent';

export interface Person {
  id: string;
  name: string;
  role: string;
  initials: string;
}

export interface Ingredient {
  id: string;
  name: string;
  /** Link into the raw-material catalog. Absent means the record is incomplete. */
  rawMaterialId?: string;
  /** Percentage of the total formula, 0–100. */
  concentration: number;
  supplier?: string;
  /** Evidence documents explicitly attached at the ingredient level. */
  evidenceIds: string[];
  /** Version in which this ingredient first appeared — drives "new ingredient" checks. */
  addedInVersion?: string;
  notes?: string;
}

export interface Formula {
  id: string;
  name: string;
  version: string;
  category: ProductCategory;
  ageGroup: AgeGroup;
  physicalForm: PhysicalForm;
  intendedUse: string;
  ownerId: string;
  reviewerId?: string;
  lifecycle: FormulaLifecycle;
  ingredients: Ingredient[];
  /** Formula-level evidence (lab reports, correspondence). */
  evidenceIds: string[];
  screeningStatus: ScreeningStatus;
  /** False when the formula changed after its latest screening run. */
  screeningCurrent: boolean;
  latestRunId?: string;
  lastScreenedAt?: string;
  reviewStatus: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  nextReviewDate?: string;
  /** Links a formula to the historical submission it was derived from, when applicable. */
  originSubmissionId?: string;
  description?: string;
}

export interface RawMaterial {
  id: string;
  name: string;
  supplier: string;
  role: MaterialRole;
  documentIds: string[];
  /** Illustrative demo ceiling used by the rule checks. Not a regulatory limit. */
  demoConcentrationCeiling?: number;
  /** Marks materials the demo rules route to expert assessment. */
  requiresExpertAssessment?: boolean;
  /** Demo rule requires a laboratory report in addition to an SDS. */
  requiresLabReport?: boolean;
  summary: string;
  usageNote: string;
}

export interface LocalAttachment {
  filename: string;
  sizeBytes: number;
  mimeType: string;
  attachedAt: string;
  attachedBy: string;
}

export interface EvidenceDocument {
  id: string;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  issuedDate?: string;
  supplier?: string;
  rawMaterialId?: string;
  formulaId?: string;
  submissionId?: string;
  /** Short synthetic abstract shown in the document preview. */
  summary: string;
  /** Local-only file metadata. No file content is read, uploaded, or analyzed. */
  localAttachment?: LocalAttachment;
}

export interface FindingRecord {
  id: string;
  severity: Severity;
  scope: 'ingredient' | 'formula';
  reference: string;
  ruleId: string;
  concern: string;
  explanation: string;
  evidenceReference: string;
  recommendedAction: string;
  reviewState: 'open' | 'acknowledged' | 'resolved';
}

export interface ExposureInputRecord {
  key: string;
  label: string;
  unit: string;
  available: boolean;
  value?: string;
  source: string;
}

export interface HistoricalComparisonRecord {
  submissionId: string;
  formulaId: string;
  formulaName: string;
  version: string;
  outcome: SubmissionOutcome;
  /** Demo ingredient-overlap score: shared materials ÷ distinct materials across both. */
  overlapScore: number;
  sharedCount: number;
  distinctCount: number;
  keyDifferences: string[];
}

export type NextActionKind =
  | 'request-supplier-documentation'
  | 'add-laboratory-evidence'
  | 'expert-review'
  | 'review-alternative'
  | 'complete-formula-record';

export interface NextActionRecord {
  id: string;
  kind: NextActionKind;
  label: string;
  detail: string;
  relatedReference?: string;
}

export interface ScreeningRun {
  id: string;
  formulaId: string;
  formulaName: string;
  formulaVersion: string;
  status: Exclude<ScreeningStatus, 'not-screened'>;
  /** 0–100, share of required demo evidence that is present. */
  evidenceCompleteness: number;
  requiredEvidenceCount: number;
  presentEvidenceCount: number;
  runAt: string;
  runBy: string;
  summary: string;
  findings: FindingRecord[];
  exposureInputs: ExposureInputRecord[];
  comparisons: HistoricalComparisonRecord[];
  nextActions: NextActionRecord[];
  /** True once the formula changed after this run completed. */
  outdated: boolean;
  /** Snapshot of the ingredient list at run time. */
  ingredientSnapshot: { name: string; rawMaterialId?: string; concentration: number }[];
}

export type ReviewDecisionKind = 'request-evidence' | 'review-complete' | 'return-for-changes';

export interface ReviewDecision {
  id: string;
  formulaId: string;
  runId: string;
  decision: ReviewDecisionKind;
  note: string;
  decidedById: string;
  decidedAt: string;
}

export interface SubmissionTimelineEntry {
  date: string;
  label: string;
  detail: string;
}

export interface SubmissionCorrespondence {
  id: string;
  date: string;
  from: string;
  subject: string;
  body: string;
}

export interface SubmissionSnapshotIngredient {
  name: string;
  rawMaterialId?: string;
  concentration: number;
}

export interface Submission {
  id: string;
  formulaId: string;
  formulaName: string;
  version: string;
  category: ProductCategory;
  submittedAt: string;
  closedAt?: string;
  outcome: SubmissionOutcome;
  reviewRounds: number;
  feedbackTheme: string;
  snapshot: SubmissionSnapshotIngredient[];
  timeline: SubmissionTimelineEntry[];
  correspondence: SubmissionCorrespondence[];
  requestedChanges: string[];
  evidenceIds: string[];
  findings: { severity: Severity; title: string; detail: string }[];
}

export type AlertType =
  | 'safety-source-update'
  | 'supplier-document-update'
  | 'evidence-gap'
  | 'scheduled-review';

export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface MonitoringAlert {
  id: string;
  type: AlertType;
  severity: Exclude<Severity, 'info'>;
  title: string;
  whatChanged: string;
  sourceReference: string;
  matchReason: string;
  affectedFormulaIds: string[];
  relatedRawMaterialId?: string;
  suggestedAction: string;
  status: AlertStatus;
  assignedToId?: string;
  createdAt: string;
  dueDate?: string;
  resolutionNote?: string;
  /** Flags alerts produced by the "Simulate update" demo control. */
  simulated?: boolean;
}

export type ActivityType =
  | 'formula-created'
  | 'formula-updated'
  | 'formula-duplicated'
  | 'formula-archived'
  | 'screening-run'
  | 'review-decision'
  | 'evidence-added'
  | 'alert-updated'
  | 'demo-reset';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  actorId: string;
  at: string;
  summary: string;
  detail?: string;
  formulaId?: string;
  runId?: string;
  alertId?: string;
  submissionId?: string;
  rawMaterialId?: string;
}

export type TableDensity = 'compact' | 'comfortable';

export interface DemoSettings {
  currentUserId: string;
  defaultReviewerId: string;
  tableDensity: TableDensity;
}

export interface DemoDataset {
  people: Person[];
  formulas: Formula[];
  rawMaterials: RawMaterial[];
  documents: EvidenceDocument[];
  submissions: Submission[];
  alerts: MonitoringAlert[];
  runs: ScreeningRun[];
  decisions: ReviewDecision[];
  activities: ActivityEvent[];
  settings: DemoSettings;
}
