import type {
  DemoSettings,
  EvidenceDocument,
  Formula,
  MonitoringAlert,
  ReviewDecision,
  ScreeningRun,
  SourceReviewDraft,
  Submission,
} from '../types/domain';
import type {
  AlertDetail,
  AttachmentInput,
  DashboardSummary,
  FormulaComparison,
  FormulaDetail,
  FormulaFilters,
  FormulaInput,
  FormulaRow,
  MonitoringAlertUpdate,
  MonitoringFilters,
  MonitoringSummary,
  Paginated,
  RawMaterialDetail,
  RawMaterialFilters,
  RawMaterialRow,
  ReviewDecisionInput,
  RunScreeningOptions,
  ScreeningResultView,
  SearchResult,
  SubmissionDetail,
  SubmissionFilters,
} from '../types/services';

/**
 * The application's data contract.
 *
 * Pages and components depend on this interface only. The demo ships a local
 * implementation backed by the in-memory store; an HTTP implementation can be
 * substituted in `services/index.ts` without touching any page.
 */
export interface FormulaInsightServices {
  listFormulas(filters?: FormulaFilters): Promise<Paginated<FormulaRow>>;
  getFormula(id: string): Promise<FormulaDetail>;
  createFormula(input: FormulaInput): Promise<Formula>;
  updateFormula(id: string, input: FormulaInput): Promise<Formula>;
  duplicateFormula(id: string): Promise<Formula>;
  archiveFormula(id: string): Promise<Formula>;

  runScreening(formulaId: string, options?: RunScreeningOptions): Promise<ScreeningRun>;
  retryExplanation(runId: string): Promise<ScreeningRun>;
  getScreeningResult(runId: string): Promise<ScreeningResultView>;
  saveReviewDecision(input: ReviewDecisionInput): Promise<ReviewDecision>;
  saveSourceReviewDraft(draft: SourceReviewDraft): Promise<SourceReviewDraft>;

  listSubmissions(filters?: SubmissionFilters): Promise<Submission[]>;
  getSubmission(id: string): Promise<SubmissionDetail>;
  compareFormulas(currentId: string, submissionId: string): Promise<FormulaComparison>;

  listMonitoringAlerts(filters?: MonitoringFilters): Promise<MonitoringSummary>;
  getMonitoringAlert(id: string): Promise<AlertDetail>;
  updateMonitoringAlert(id: string, input: MonitoringAlertUpdate): Promise<MonitoringAlert>;
  simulateMonitoringUpdate(): Promise<MonitoringAlert>;

  listRawMaterials(filters?: RawMaterialFilters): Promise<RawMaterialRow[]>;
  getRawMaterial(id: string): Promise<RawMaterialDetail>;

  getDashboardSummary(): Promise<DashboardSummary>;
  search(query: string): Promise<SearchResult[]>;

  attachLocalFile(input: AttachmentInput): Promise<EvidenceDocument>;
  linkFormulaDocument(formulaId: string, documentId: string): Promise<Formula>;

  updateSettings(settings: Partial<DemoSettings>): Promise<DemoSettings>;
  resetDemoData(): Promise<void>;
}

export class ServiceError extends Error {
  readonly recoverable: boolean;

  constructor(message: string, recoverable = true) {
    super(message);
    this.name = 'ServiceError';
    this.recoverable = recoverable;
  }
}
