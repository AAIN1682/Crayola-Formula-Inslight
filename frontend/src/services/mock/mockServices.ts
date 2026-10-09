import type {
  ActivityEvent,
  DemoSettings,
  EvidenceDocument,
  Formula,
  Ingredient,
  MonitoringAlert,
  ReviewDecision,
  ReviewStatus,
  ScreeningRun,
  ScreeningStatus,
  SourceReviewDraft,
} from '../../types/domain';
import type {
  AlertDetail,
  AttachmentInput,
  DashboardMetric,
  DashboardSummary,
  FormulaComparison,
  FormulaDetail,
  FormulaFilters,
  FormulaInput,
  FormulaRow,
  MonitoringAlertUpdate,
  MonitoringFilters,
  MonitoringSummary,
  OutcomeTrendPoint,
  Paginated,
  PriorityQueueRow,
  RawMaterialDetail,
  RawMaterialFilters,
  RawMaterialRow,
  ReviewDecisionInput,
  RunScreeningOptions,
  ScreeningResultView,
  SearchResult,
  SubmissionDetail,
  SubmissionFilters,
} from '../../types/services';
import type { DemoStore } from '../../state/store';
import type { DemoAction } from '../../state/reducer';
import { ServiceError, type FormulaInsightServices } from '../contracts';
import { branchSubstanceIds, formulaToPackageRequest, isLiveAzureAssessment, mapPackageAssessment, postPackageAssessment } from '../../api/formulaBackend';
import {
  diffIngredients,
  isRunCurrent,
  mainConcernFor,
  overlapScore,
  snapshotIngredients,
  summarizeEvidence,
} from '../../utils/screening';
import { includesAny, matchesQuery, paginate, sortRows, withinPeriod } from '../../utils/filtering';
import { daysUntil } from '../../utils/formatting';
import { nextSequentialId, uid } from '../../utils/ids';

const PAGE_SIZE = 10;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function lastMonths(count: number): Date[] {
  const months: Date[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  for (let index = count - 1; index >= 0; index -= 1) {
    const month = new Date(cursor);
    month.setMonth(month.getMonth() - index);
    months.push(month);
  }
  return months;
}

function quarterLabel(date: Date): string {
  return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
}

export function createMockServices(store: DemoStore): FormulaInsightServices {
  const state = () => store.getState();

  const personName = (id?: string) =>
    state().people.find((person) => person.id === id)?.name ?? 'Unassigned';

  const currentUserId = () => state().settings.currentUserId;

  const activity = (event: Omit<ActivityEvent, 'id' | 'at' | 'actorId'> & { actorId?: string }): DemoAction => ({
    type: 'activity/add',
    activity: {
      ...event,
      id: uid('ACT'),
      at: new Date().toISOString(),
      actorId: event.actorId ?? currentUserId(),
    },
  });

  const toRow = (formula: Formula): FormulaRow => {
    const current = state();
    const evidence = summarizeEvidence(formula, current.rawMaterials, current.documents);
    const run = current.runs.find((item) => item.id === formula.latestRunId);
    return {
      formula,
      ownerName: personName(formula.ownerId),
      reviewerName: formula.reviewerId ? personName(formula.reviewerId) : 'Unassigned',
      ingredientCount: formula.ingredients.length,
      missingEvidenceCount: evidence.missingCount,
      evidenceCompleteness: evidence.completeness,
      mainConcern: mainConcernFor(formula, run),
    };
  };

  const listMaterialRows = (): RawMaterialRow[] => {
    const current = state();
    return current.rawMaterials.map((material) => {
      const documents = current.documents.filter((document) => document.rawMaterialId === material.id);
      const available = documents.filter((document) => document.status === 'available');
      const expectedTypes = new Set<string>(['SDS']);
      if (['Colorant', 'Opacifier', 'Preservative', 'Deterrent additive'].includes(material.role)) {
        expectedTypes.add('Certificate of Analysis');
      }
      if (material.requiresLabReport) expectedTypes.add('Laboratory Report');
      const satisfied = Array.from(expectedTypes).filter((type) =>
        available.some((document) => document.type === type),
      ).length;
      const usageCount = current.formulas.filter(
        (formula) =>
          formula.lifecycle !== 'archived' &&
          formula.ingredients.some((ingredient) => ingredient.rawMaterialId === material.id),
      ).length;
      return {
        ...material,
        documentCount: documents.length,
        availableDocumentCount: available.length,
        evidenceCompleteness: Math.round((satisfied / expectedTypes.size) * 100),
        usageCount,
      };
    });
  };

  const buildFormulaFromInput = (
    input: FormulaInput,
    base?: Formula,
    overrides?: Partial<Formula>,
  ): Formula => {
    const now = new Date().toISOString();
    const id = base?.id ?? nextSequentialId('FML', state().formulas.map((formula) => formula.id));
    const ingredients: Ingredient[] = input.ingredients.map((ingredient, index) => ({
      id: ingredient.id ?? `${id}-ING-${String(index + 1).padStart(2, '0')}`,
      name: ingredient.name.trim(),
      rawMaterialId: ingredient.rawMaterialId,
      concentration: Number.isFinite(ingredient.concentration) ? ingredient.concentration : 0,
      supplier:
        ingredient.supplier?.trim() ||
        state().rawMaterials.find((material) => material.id === ingredient.rawMaterialId)?.supplier,
      evidenceIds: ingredient.evidenceIds ?? [],
      addedInVersion: ingredient.addedInVersion,
      notes: ingredient.notes,
      batchId: ingredient.batchId,
      compositionType: ingredient.compositionType,
      screeningRole: ingredient.screeningRole,
      needsCorrection: ingredient.needsCorrection,
      measuredValue: ingredient.measuredValue,
      measuredUnit: ingredient.measuredUnit,
      measuredBound: ingredient.measuredBound,
      measurementKind: ingredient.measurementKind,
      testMethod: ingredient.testMethod,
    }));

    return {
      id,
      name: input.name.trim(),
      version: input.version?.trim() || base?.version || 'v1.0',
      category: input.category ?? base?.category ?? 'Markers',
      ageGroup: input.ageGroup ?? base?.ageGroup ?? 'under_12',
      recordedAgeGroup: base?.recordedAgeGroup,
      ageGroupNeedsSelection: false,
      targetMarkets: input.targetMarkets ?? base?.targetMarkets ?? ['US'],
      physicalForm: input.physicalForm ?? base?.physicalForm ?? 'Liquid',
      intendedUse: input.intendedUse.trim(),
      ownerId: input.ownerId,
      reviewerId: input.reviewerId,
      lifecycle: input.lifecycle ?? base?.lifecycle ?? 'draft',
      ingredients,
      evidenceIds: input.evidenceIds,
      compositionCompleteness: input.compositionCompleteness,
      usStates: input.usStates,
      intendedAgeDetail: input.intendedAgeDetail,
      toyChildcareScope: input.toyChildcareScope,
      componentType: input.componentType,
      testMaterialCategory: input.testMaterialCategory,
      screeningStatus: base?.screeningStatus ?? 'not-screened',
      screeningCurrent: base?.screeningCurrent ?? false,
      latestRunId: base?.latestRunId,
      lastScreenedAt: base?.lastScreenedAt,
      reviewStatus: base?.reviewStatus ?? 'not-started',
      createdAt: base?.createdAt ?? now,
      updatedAt: now,
      nextReviewDate: input.nextReviewDate ?? base?.nextReviewDate,
      originSubmissionId: base?.originSubmissionId,
      description: input.description ?? base?.description,
      preferredAssessmentMode: input.preferredAssessmentMode ?? base?.preferredAssessmentMode,
      scenarioOfFormulaId: input.scenarioOfFormulaId ?? base?.scenarioOfFormulaId,
      ...overrides,
    };
  };

  const requireFormula = (id: string): Formula => {
    const formula = state().formulas.find((item) => item.id === id);
    if (!formula) throw new ServiceError(`Formula ${id} was not found in the demo workspace.`, false);
    return formula;
  };

  let assessmentGeneration = 0;

  return {
    /* ------------------------------------------------------------ formulas */

    async listFormulas(filters: FormulaFilters = {}) {
      await delay(140);
      const current = state();
      const lifecycleFilter = filters.lifecycle;

      let rows = current.formulas
        .filter((formula) =>
          lifecycleFilter && lifecycleFilter.length > 0
            ? lifecycleFilter.includes(formula.lifecycle)
            : formula.lifecycle !== 'archived',
        )
        .map(toRow);

      rows = rows.filter((row) => {
        const { formula } = row;
        if (!matchesQuery(filters.query, [formula.name, formula.id, formula.description])) return false;
        if (!includesAny(filters.categories, formula.category)) return false;
        if (!includesAny(filters.screeningStatuses, formula.screeningStatus)) return false;
        if (!includesAny(filters.reviewStatuses, formula.reviewStatus)) return false;
        if (!includesAny(filters.ownerIds, formula.ownerId)) return false;
        if (filters.onlyOutdated && formula.screeningCurrent) return false;
        if (filters.onlyOutdated && formula.screeningStatus === 'not-screened') return false;
        if (filters.onlyMissingEvidence && row.missingEvidenceCount === 0) return false;
        return true;
      });

      const sortKey = filters.sortKey ?? 'updatedAt';
      const direction = filters.sortDirection ?? (sortKey === 'updatedAt' ? 'desc' : 'asc');
      const selectors: Record<string, (row: FormulaRow) => string | number | undefined> = {
        name: (row) => row.formula.name,
        version: (row) => row.formula.version,
        category: (row) => row.formula.category,
        ingredientCount: (row) => row.ingredientCount,
        screeningStatus: (row) => row.formula.screeningStatus,
        reviewStatus: (row) => row.formula.reviewStatus,
        owner: (row) => row.ownerName,
        updatedAt: (row) => new Date(row.formula.updatedAt).getTime(),
      };
      const sorted = sortRows(rows, selectors[sortKey] ?? selectors.name!, direction);

      return paginate(sorted, filters.page ?? 1, filters.pageSize ?? PAGE_SIZE) as Paginated<FormulaRow>;
    },

    async getFormula(id: string): Promise<FormulaDetail> {
      await delay(130);
      const formula = requireFormula(id);
      const current = state();
      const evidence = summarizeEvidence(formula, current.rawMaterials, current.documents);
      const documents = current.documents.filter(
        (document) =>
          formula.evidenceIds.includes(document.id) ||
          document.formulaId === formula.id ||
          formula.ingredients.some((ingredient) => ingredient.rawMaterialId === document.rawMaterialId),
      );
      const runs = current.runs
        .filter((run) => run.formulaId === formula.id)
        .sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());
      const latestRun = runs.find((run) => run.id === formula.latestRunId) ?? runs[0];

      return {
        formula,
        owner: personName(formula.ownerId),
        reviewer: formula.reviewerId ? personName(formula.reviewerId) : undefined,
        evidence,
        documents,
        runs,
        latestRun,
        decisions: current.decisions
          .filter((decision) => decision.formulaId === formula.id)
          .sort((a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime()),
        activities: current.activities.filter((event) => event.formulaId === formula.id),
        linkedMaterials: current.rawMaterials.filter((material) =>
          formula.ingredients.some((ingredient) => ingredient.rawMaterialId === material.id),
        ),
        relatedAlerts: current.alerts.filter(
          (alert) => alert.affectedFormulaIds.includes(formula.id) && alert.status !== 'resolved',
        ),
      };
    },

    async createFormula(input: FormulaInput) {
      await delay(200);
      const formula = buildFormulaFromInput(input);
      store.dispatch({
        type: 'batch',
        actions: [
          { type: 'formula/upsert', formula },
          activity({
            type: 'formula-created',
            summary: `${formula.name} created`,
            detail:
              formula.lifecycle === 'draft'
                ? 'Saved as a draft. Missing fields are listed on the formula record.'
                : `${formula.ingredients.length} ingredients recorded.`,
            formulaId: formula.id,
          }),
        ],
      });
      return formula;
    },

    async updateFormula(id: string, input: FormulaInput) {
      await delay(200);
      const base = requireFormula(id);
      const updated = buildFormulaFromInput(input, base);
      const latestRun = state().runs.find((run) => run.id === base.latestRunId);
      const stillCurrent = isRunCurrent(updated, latestRun);

      const formula: Formula = {
        ...updated,
        screeningCurrent: latestRun ? stillCurrent : false,
      };

      const actions: DemoAction[] = [{ type: 'formula/upsert', formula }];
      if (latestRun && !stillCurrent) {
        actions.push({ type: 'run/markOutdated', formulaId: formula.id });
      }
      actions.push(
        activity({
          type: 'formula-updated',
          summary: `${formula.name} updated${formula.version !== base.version ? ` to ${formula.version}` : ''}`,
            detail:
            latestRun && !stillCurrent
              ? 'Reassessment required. The saved result no longer matches the composition, age group, or target markets.'
              : 'Formula record updated.',
          formulaId: formula.id,
        }),
      );

      store.dispatch({ type: 'batch', actions });
      return formula;
    },

    async duplicateFormula(id: string) {
      await delay(180);
      const base = requireFormula(id);
      const newId = nextSequentialId('FML', state().formulas.map((formula) => formula.id));
      const now = new Date().toISOString();
      const formula: Formula = {
        ...base,
        id: newId,
        name: `${base.name} (copy)`,
        version: 'v1.0',
        lifecycle: 'draft',
        screeningStatus: 'not-screened',
        screeningCurrent: false,
        latestRunId: undefined,
        lastScreenedAt: undefined,
        reviewStatus: 'not-started',
        createdAt: now,
        updatedAt: now,
        evidenceIds: [...base.evidenceIds],
        ingredients: base.ingredients.map((ingredient, index) => ({
          ...ingredient,
          id: `${newId}-ING-${String(index + 1).padStart(2, '0')}`,
          addedInVersion: undefined,
        })),
      };

      store.dispatch({
        type: 'batch',
        actions: [
          { type: 'formula/upsert', formula },
          activity({
            type: 'formula-duplicated',
            summary: `${base.name} duplicated as ${formula.name}`,
            detail: 'The copy starts as a draft and has not been screened.',
            formulaId: formula.id,
          }),
        ],
      });
      return formula;
    },

    async archiveFormula(id: string) {
      await delay(160);
      const base = requireFormula(id);
      const formula: Formula = { ...base, lifecycle: 'archived', updatedAt: new Date().toISOString() };
      store.dispatch({
        type: 'batch',
        actions: [
          { type: 'formula/upsert', formula },
          activity({
            type: 'formula-archived',
            summary: `${formula.name} archived`,
            detail: 'The record is hidden from the default library view.',
            formulaId: formula.id,
          }),
        ],
      });
      return formula;
    },

    /* ----------------------------------------------------------- screening */

    async runScreening(formulaId: string, options?: RunScreeningOptions) {
      const generation = ++assessmentGeneration;
      const formula = requireFormula(formulaId);
      if (formula.ageGroupNeedsSelection || !formula.ageGroup) {
        throw new ServiceError('Select an age group before running an assessment.', false);
      }
      if (!formula.targetMarkets?.length) {
        throw new ServiceError('Select at least one target market before running an assessment.', false);
      }
      if (options?.signal?.aborted) {
        throw new ServiceError('Screening was cancelled.');
      }

      let catalogIds: Set<string>;
      try {
        catalogIds = await branchSubstanceIds(formula, options?.signal);
      } catch (error) {
        if (options?.signal?.aborted) throw new ServiceError('Screening was cancelled.');
        const message = error instanceof Error ? error.message : 'The material catalog could not be loaded.';
        throw new ServiceError(message);
      }
      if (generation !== assessmentGeneration) {
        throw new ServiceError('A newer assessment replaced this result.');
      }

      let payload: Awaited<ReturnType<typeof postPackageAssessment>>;
      try {
        payload = await postPackageAssessment(
          formulaToPackageRequest(formula, true, options?.assessmentMode ?? formula.preferredAssessmentMode ?? 'evidence', catalogIds),
          options?.signal,
        );
      } catch (error) {
        if (options?.signal?.aborted) throw new ServiceError('Screening was cancelled.');
        const message = error instanceof Error ? error.message : 'The assessment service could not be reached.';
        throw new ServiceError(message);
      }
      if (generation !== assessmentGeneration) {
        throw new ServiceError('A newer assessment replaced this result.');
      }
      const mapped = mapPackageAssessment(payload);
      const formulaAssessment = payload;
      const status = mapped.status;
      const summary = mapped.summary;
      const findings = mapped.findings;
      const marketResults = mapped.marketResults;
      const nextActions = mapped.nextActions;
      const evidence = {
        completeness: mapped.evidenceCompleteness,
        requiredCount: mapped.requiredEvidenceCount,
        presentCount: mapped.presentEvidenceCount,
      };
      const exposureInputs: ScreeningRun['exposureInputs'] = [];
      const comparisons: ScreeningRun['comparisons'] = [];
      const referenceAssessment: ScreeningRun['referenceAssessment'] = undefined;
      const live = isLiveAzureAssessment(payload);

      const runAt = new Date().toISOString();
      const run: ScreeningRun = {
        id: uid('RUN'),
        formulaId: formula.id,
        formulaName: formula.name,
        formulaVersion: formula.version,
        ageGroup: formula.ageGroup,
        targetMarkets: [...formula.targetMarkets],
        marketResults,
        assessmentRequest: {
          target_markets: [...formula.targetMarkets],
          age_group: formula.ageGroup,
        },
        status,
        evidenceCompleteness: evidence.completeness,
        requiredEvidenceCount: evidence.requiredCount,
        presentEvidenceCount: evidence.presentCount,
        runAt,
        runBy: currentUserId(),
        summary,
        findings,
        exposureInputs,
        comparisons,
        nextActions,
        outdated: false,
        ingredientSnapshot: snapshotIngredients(formula.ingredients),
        referenceAssessment,
        formulaAssessment,
        legacySample: false,
        physicalForm: formula.physicalForm,
        intendedUse: formula.intendedUse,
        category: formula.category,
        inputHash: payload.input_hash ?? payload.execution?.input_hash,
        dataHash: payload.data_hash ?? payload.execution?.data_hash,
        aiStatus: live ? 'succeeded' : payload.execution?.llm_status === 'failed' ? 'failed' : 'not_requested',
        assessmentMode: payload.assessment_mode ?? options?.assessmentMode ?? 'evidence',
      };

      const reviewStatus: ReviewStatus =
        formula.reviewStatus === 'not-started' ? 'in-review' : formula.reviewStatus;

      const updatedFormula: Formula = {
        ...formula,
        screeningStatus: status,
        screeningCurrent: true,
        preferredAssessmentMode: run.assessmentMode ?? formula.preferredAssessmentMode,
        latestRunId: run.id,
        lastScreenedAt: runAt,
        reviewStatus,
      };

      store.dispatch({
        type: 'batch',
        actions: [
          { type: 'run/markOutdated', formulaId: formula.id },
          { type: 'run/add', run },
          { type: 'formula/upsert', formula: updatedFormula },
          activity({
            type: 'screening-run',
            summary: `Screening run completed for ${formula.name} ${formula.version}`,
            detail: live
              ? `Live Azure assessment · ${status.toUpperCase()} · ${run.assessmentMode === 'scenario' ? 'scenario evidence completeness' : 'verified evidence coverage'} ${evidence.completeness}%.`
              : `Partial calculated result · AI analysis ${payload.execution?.llm_status ?? 'unavailable'} · ${status.toUpperCase()}.`,
            formulaId: formula.id,
            runId: run.id,
          }),
        ],
      });

      return run;
    },

    async retryExplanation(runId: string) {
      const run = state().runs.find((item) => item.id === runId);
      if (!run?.formulaAssessment) {
        throw new ServiceError('This result has no server assessment to explain again.', false);
      }
      const payload = await postPackageAssessment({ ...run.formulaAssessment.input_snapshot, generate_explanation: true });
      const mapped = mapPackageAssessment(payload);
      const updated: ScreeningRun = {
        ...run,
        formulaAssessment: payload,
        summary: mapped.summary,
        findings: mapped.findings,
        nextActions: mapped.nextActions,
        marketResults: mapped.marketResults,
        evidenceCompleteness: mapped.evidenceCompleteness,
        requiredEvidenceCount: mapped.requiredEvidenceCount,
        presentEvidenceCount: mapped.presentEvidenceCount,
        aiStatus: isLiveAzureAssessment(payload) ? 'succeeded' : payload.execution?.llm_status === 'failed' ? 'failed' : run.aiStatus,
        inputHash: payload.input_hash ?? payload.execution?.input_hash ?? run.inputHash,
        dataHash: payload.data_hash ?? payload.execution?.data_hash ?? run.dataHash,
      };
      store.dispatch({ type: 'run/add', run: updated });
      return updated;
    },

    async getScreeningResult(runId: string): Promise<ScreeningResultView> {
      await delay(120);
      const current = state();
      const run = current.runs.find((item) => item.id === runId);
      if (!run) throw new ServiceError(`Screening run ${runId} was not found.`, false);
      const formula = requireFormula(run.formulaId);
      return {
        run,
        formula,
        isCurrent: isRunCurrent(formula, run) && !run.outdated,
        decisions: current.decisions
          .filter((decision) => decision.runId === run.id)
          .sort((a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime()),
        ownerName: personName(formula.ownerId),
      };
    },

    async saveSourceReviewDraft(draft: SourceReviewDraft) {
      store.dispatch({ type: 'sourceReview/upsert', draft });
      return draft;
    },

    async saveReviewDecision(input: ReviewDecisionInput) {
      await delay(220);
      const note = input.note.trim();
      if (!note) throw new ServiceError('A review note is required before a decision can be recorded.');
      const formula = requireFormula(input.formulaId);

      const decision: ReviewDecision = {
        id: uid('DEC'),
        formulaId: input.formulaId,
        runId: input.runId,
        decision: input.decision,
        note,
        decidedById: currentUserId(),
        decidedAt: new Date().toISOString(),
      };

      const reviewStatus: ReviewStatus =
        input.decision === 'review-complete'
          ? 'complete'
          : input.decision === 'request-evidence'
            ? 'awaiting-evidence'
            : 'returned';

      const summaryByDecision: Record<typeof input.decision, string> = {
        'request-evidence': `More evidence requested for ${formula.name}`,
        'review-complete': `Internal review marked complete for ${formula.name}`,
        'return-for-changes': `${formula.name} returned for formulation changes`,
      };

      store.dispatch({
        type: 'batch',
        actions: [
          { type: 'decision/add', decision },
          {
            type: 'formula/upsert',
            formula: { ...formula, reviewStatus, updatedAt: decision.decidedAt },
          },
          activity({
            type: 'review-decision',
            summary: summaryByDecision[input.decision],
            detail: note,
            formulaId: formula.id,
            runId: input.runId,
          }),
        ],
      });

      return decision;
    },

    /* --------------------------------------------------------- submissions */

    async listSubmissions(filters: SubmissionFilters = {}) {
      await delay(130);
      return state()
        .submissions.filter((submission) => {
          if (!matchesQuery(filters.query, [submission.id, submission.formulaName, submission.feedbackTheme]))
            return false;
          if (!includesAny(filters.categories, submission.category)) return false;
          if (!includesAny(filters.outcomes, submission.outcome)) return false;
          if (filters.periodMonths && !withinPeriod(submission.submittedAt, filters.periodMonths))
            return false;
          return true;
        })
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    },

    async getSubmission(id: string): Promise<SubmissionDetail> {
      await delay(120);
      const current = state();
      const submission = current.submissions.find((item) => item.id === id);
      if (!submission) throw new ServiceError(`Submission ${id} was not found.`, false);
      return {
        submission,
        currentFormula: current.formulas.find((formula) => formula.id === submission.formulaId),
        documents: current.documents.filter((document) => document.submissionId === submission.id),
      };
    },

    async compareFormulas(currentId: string, submissionId: string): Promise<FormulaComparison> {
      await delay(160);
      const current = state();
      const formula = requireFormula(currentId);
      const submission = current.submissions.find((item) => item.id === submissionId);
      if (!submission) throw new ServiceError(`Submission ${submissionId} was not found.`, false);

      const rows = diffIngredients(formula.ingredients, submission.snapshot);
      const { score, sharedCount, distinctCount } = overlapScore(formula.ingredients, submission.snapshot);

      return {
        currentFormula: formula,
        submission,
        rows,
        sharedCount,
        addedCount: rows.filter((row) => row.kind === 'added').length,
        removedCount: rows.filter((row) => row.kind === 'removed').length,
        changedCount: rows.filter((row) => row.kind === 'changed').length,
        overlapScore: score,
        distinctCount,
      };
    },

    /* ---------------------------------------------------------- monitoring */

    async listMonitoringAlerts(filters: MonitoringFilters = {}): Promise<MonitoringSummary> {
      await delay(140);
      const current = state();
      const alerts = current.alerts
        .filter((alert) => {
          if (!matchesQuery(filters.query, [alert.title, alert.whatChanged, alert.sourceReference]))
            return false;
          if (!includesAny(filters.types, alert.type)) return false;
          if (!includesAny(filters.statuses, alert.status)) return false;
          if (!includesAny(filters.severities, alert.severity)) return false;
          if (
            filters.assignedToIds &&
            filters.assignedToIds.length > 0 &&
            !filters.assignedToIds.includes(alert.assignedToId ?? 'unassigned')
          )
            return false;
          return true;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const openAlerts = current.alerts.filter((alert) => alert.status === 'open');
      const affected = new Set<string>();
      openAlerts.forEach((alert) => alert.affectedFormulaIds.forEach((id) => affected.add(id)));

      const upcomingReviews = current.formulas
        .filter((formula) => formula.lifecycle !== 'archived' && formula.nextReviewDate)
        .map((formula) => ({
          formulaId: formula.id,
          formulaName: formula.name,
          version: formula.version,
          dueDate: formula.nextReviewDate as string,
          daysUntil: daysUntil(formula.nextReviewDate) ?? 0,
          screeningStatus: formula.screeningStatus,
        }))
        .filter((entry) => entry.daysUntil <= 120)
        .sort((a, b) => a.daysUntil - b.daysUntil)
        .slice(0, 8);

      return {
        alerts,
        openCount: openAlerts.length,
        acknowledgedCount: current.alerts.filter((alert) => alert.status === 'acknowledged').length,
        resolvedCount: current.alerts.filter((alert) => alert.status === 'resolved').length,
        affectedFormulaCount: affected.size,
        upcomingReviews,
      };
    },

    async getMonitoringAlert(id: string): Promise<AlertDetail> {
      await delay(110);
      const current = state();
      const alert = current.alerts.find((item) => item.id === id);
      if (!alert) throw new ServiceError(`Alert ${id} was not found.`, false);
      return {
        alert,
        affectedFormulas: current.formulas.filter((formula) =>
          alert.affectedFormulaIds.includes(formula.id),
        ),
        material: current.rawMaterials.find((material) => material.id === alert.relatedRawMaterialId),
        assigneeName: alert.assignedToId ? personName(alert.assignedToId) : undefined,
      };
    },

    async updateMonitoringAlert(id: string, input: MonitoringAlertUpdate) {
      await delay(180);
      const current = state();
      const base = current.alerts.find((item) => item.id === id);
      if (!base) throw new ServiceError(`Alert ${id} was not found.`, false);
      if (input.status === 'resolved' && !input.resolutionNote?.trim()) {
        throw new ServiceError('A note is required when resolving an alert.');
      }

      const alert: MonitoringAlert = {
        ...base,
        status: input.status ?? base.status,
        assignedToId:
          input.assignedToId === null ? undefined : (input.assignedToId ?? base.assignedToId),
        resolutionNote: input.resolutionNote?.trim() || base.resolutionNote,
      };

      const actions: DemoAction[] = [{ type: 'alert/upsert', alert }];

      if (input.createReassessmentTask) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 14);
        for (const formulaId of alert.affectedFormulaIds) {
          const formula = current.formulas.find((item) => item.id === formulaId);
          if (!formula) continue;
          actions.push({
            type: 'formula/upsert',
            formula: {
              ...formula,
              reviewStatus: 'in-review',
              nextReviewDate: dueDate.toISOString(),
              updatedAt: new Date().toISOString(),
            },
          });
        }
        actions.push(
          activity({
            type: 'alert-updated',
            summary: `Reassessment task created from ${alert.id}`,
            detail: `${alert.affectedFormulaIds.length} affected ${
              alert.affectedFormulaIds.length === 1 ? 'formula is' : 'formulas are'
            } scheduled for reassessment within 14 days.`,
            alertId: alert.id,
          }),
        );
      }

      if (input.status && input.status !== base.status) {
        actions.push(
          activity({
            type: 'alert-updated',
            summary: `Alert ${alert.id} marked ${input.status}`,
            detail: input.resolutionNote?.trim() || alert.title,
            alertId: alert.id,
          }),
        );
      } else if (input.assignedToId !== undefined) {
        actions.push(
          activity({
            type: 'alert-updated',
            summary: `Alert ${alert.id} assigned to ${personName(alert.assignedToId)}`,
            detail: alert.title,
            alertId: alert.id,
          }),
        );
      }

      store.dispatch({ type: 'batch', actions });
      return alert;
    },

    async simulateMonitoringUpdate() {
      await delay(260);
      const current = state();
      const candidates = ['RM-110', 'RM-112', 'RM-115', 'RM-102', 'RM-124', 'RM-113'];
      const simulatedCount = current.alerts.filter((alert) => alert.simulated).length;
      const materialId = candidates[simulatedCount % candidates.length] as string;
      const material = current.rawMaterials.find((item) => item.id === materialId);
      const affected = current.formulas
        .filter(
          (formula) =>
            formula.lifecycle !== 'archived' &&
            formula.ingredients.some((ingredient) => ingredient.rawMaterialId === materialId),
        )
        .map((formula) => formula.id);

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10);

      const alert: MonitoringAlert = {
        id: uid('ALR'),
        type: 'safety-source-update',
        severity: 'medium',
        title: `Simulated demo update for ${material?.name ?? materialId}`,
        whatChanged:
          'A simulated entry was added to the illustrative demo safety source. It exists only to demonstrate how an update flows through the monitoring screen.',
        sourceReference: `Simulated demo source · generated ${new Date().toLocaleDateString()}`,
        matchReason: `${materialId} appears in ${affected.length} active ${
          affected.length === 1 ? 'formula' : 'formulas'
        } in this workspace.`,
        affectedFormulaIds: affected,
        relatedRawMaterialId: materialId,
        suggestedAction: 'Review the affected formulas and confirm the supporting documents are current.',
        status: 'open',
        createdAt: new Date().toISOString(),
        dueDate: dueDate.toISOString(),
        simulated: true,
      };

      store.dispatch({
        type: 'batch',
        actions: [
          { type: 'alert/upsert', alert },
          activity({
            type: 'alert-updated',
            summary: `Simulated monitoring alert created — ${material?.name ?? materialId}`,
            detail: alert.matchReason,
            alertId: alert.id,
          }),
        ],
      });

      return alert;
    },

    /* ------------------------------------------------------- raw materials */

    async listRawMaterials(filters: RawMaterialFilters = {}) {
      await delay(130);
      return listMaterialRows()
        .filter((row) => {
          if (!matchesQuery(filters.query, [row.name, row.id, row.supplier, row.role])) return false;
          if (!includesAny(filters.roles, row.role as string)) return false;
          if (!includesAny(filters.suppliers, row.supplier)) return false;
          if (filters.onlyWithGaps && row.evidenceCompleteness >= 100) return false;
          return true;
        })
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async getRawMaterial(id: string): Promise<RawMaterialDetail> {
      await delay(120);
      const current = state();
      const material = listMaterialRows().find((item) => item.id === id);
      if (!material) throw new ServiceError(`Raw material ${id} was not found.`, false);

      const usedIn = current.formulas
        .filter((formula) => formula.ingredients.some((ingredient) => ingredient.rawMaterialId === id))
        .map((formula) => ({
          formulaId: formula.id,
          formulaName: formula.name,
          version: formula.version,
          concentration:
            formula.ingredients.find((ingredient) => ingredient.rawMaterialId === id)?.concentration ?? 0,
        }));

      const historicalUsage = current.submissions
        .filter((submission) => submission.snapshot.some((row) => row.rawMaterialId === id))
        .map((submission) => ({
          submissionId: submission.id,
          formulaName: submission.formulaName,
          outcome: submission.outcome,
          submittedAt: submission.submittedAt,
        }));

      const gaps: string[] = [];
      const documents = current.documents.filter((document) => document.rawMaterialId === id);
      if (!documents.some((document) => document.type === 'SDS' && document.status === 'available')) {
        gaps.push('No current safety data sheet on file.');
      }
      if (
        material.requiresLabReport &&
        !documents.some((document) => document.type === 'Laboratory Report' && document.status === 'available')
      ) {
        gaps.push('A laboratory report is requested by the demo rule checks but is not on file.');
      }
      if (
        ['Colorant', 'Opacifier', 'Preservative', 'Deterrent additive'].includes(material.role) &&
        !documents.some(
          (document) => document.type === 'Certificate of Analysis' && document.status === 'available',
        )
      ) {
        gaps.push('No certificate of analysis on file for this material class.');
      }
      if (material.requiresExpertAssessment) {
        gaps.push('The demo rule set routes this material to a product safety specialist.');
      }

      return { material, documents, usedIn, historicalUsage, gaps };
    },

    /* ---------------------------------------------------------- dashboard */

    async getDashboardSummary(): Promise<DashboardSummary> {
      await delay(170);
      const current = state();
      const active = current.formulas.filter((formula) => formula.lifecycle !== 'archived');

      const rows = active.map(toRow);
      const awaitingReview = rows.filter(
        (row) => row.formula.screeningStatus !== 'not-screened' && row.formula.reviewStatus !== 'complete',
      );
      const missingEvidence = rows.filter((row) => row.missingEvidenceCount > 0);
      const openAlerts = current.alerts.filter((alert) => alert.status === 'open');
      const outdated = rows.filter(
        (row) => row.formula.screeningStatus !== 'not-screened' && !row.formula.screeningCurrent,
      );
      const dueForReview = active.filter((formula) => {
        const days = daysUntil(formula.nextReviewDate);
        return days !== undefined && days <= 30;
      });

      const months = lastMonths(6);
      const totalTrend = months.map(
        (month) =>
          current.formulas.filter((formula) => {
            const created = new Date(formula.createdAt);
            const end = new Date(month);
            end.setMonth(end.getMonth() + 1);
            return created.getTime() < end.getTime();
          }).length,
      );
      const alertTrend = months.map((month) => {
        const key = monthKey(month);
        return current.alerts.filter((alert) => monthKey(new Date(alert.createdAt)) === key).length;
      });

      const metrics: DashboardMetric[] = [
        {
          key: 'total',
          label: 'Total formulas',
          value: active.length,
          caption: `${current.formulas.length - active.length} archived`,
          to: '/formulas',
          trend: totalTrend,
        },
        {
          key: 'awaiting-review',
          label: 'Awaiting review',
          value: awaitingReview.length,
          caption: 'Screened, internal review not complete',
          to: '/formulas?review=pending',
        },
        {
          key: 'missing-evidence',
          label: 'Missing evidence',
          value: missingEvidence.length,
          caption: 'At least one required document absent',
          to: '/formulas?evidence=missing',
        },
        {
          key: 'open-alerts',
          label: 'Open monitoring alerts',
          value: openAlerts.length,
          caption: `${new Set(openAlerts.flatMap((alert) => alert.affectedFormulaIds)).size} formulas affected`,
          to: '/monitoring?status=open',
          trend: alertTrend,
        },
      ];

      const statuses: ScreeningStatus[] = ['green', 'amber', 'red', 'not-screened'];
      const statusDistribution = statuses.map((status) => {
        const count = active.filter((formula) => formula.screeningStatus === status).length;
        return { status, count, share: active.length === 0 ? 0 : count / active.length };
      });

      /* Historical outcome trend, grouped by calendar quarter. */
      const byQuarter = new Map<string, OutcomeTrendPoint>();
      const sortedSubmissions = [...current.submissions].sort(
        (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
      );
      for (const submission of sortedSubmissions) {
        const date = new Date(submission.submittedAt);
        const start = new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
        const label = quarterLabel(date);
        const point =
          byQuarter.get(label) ??
          ({
            period: label,
            periodStart: start.toISOString(),
            AP: 0,
            CL: 0,
            'More Data Needed': 0,
            total: 0,
          } satisfies OutcomeTrendPoint);
        point[submission.outcome] += 1;
        point.total += 1;
        byQuarter.set(label, point);
      }

      const priorityQueue: PriorityQueueRow[] = rows
        .map((row) => {
          const { formula } = row;
          let priority = 0;
          if (formula.screeningStatus === 'red' && formula.reviewStatus !== 'complete') priority += 100;
          if (formula.screeningStatus !== 'not-screened' && !formula.screeningCurrent) priority += 70;
          if (row.missingEvidenceCount > 0) priority += 45;
          if (formula.screeningStatus === 'amber' && formula.reviewStatus !== 'complete') priority += 40;
          if (formula.screeningStatus === 'not-screened') priority += 30;
          const days = daysUntil(formula.nextReviewDate);
          if (days !== undefined && days <= 30) priority += 35;
          if (formula.reviewStatus === 'returned') priority += 25;
          return {
            formulaId: formula.id,
            formulaName: formula.name,
            version: formula.version,
            category: formula.category,
            screeningStatus: formula.screeningStatus,
            screeningCurrent: formula.screeningCurrent,
            mainConcern: row.mainConcern,
            reviewerName: row.reviewerName,
            updatedAt: formula.updatedAt,
            priority,
          } satisfies PriorityQueueRow;
        })
        .filter((row) => row.priority > 0)
        .sort(
          (a, b) =>
            b.priority - a.priority || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 7);

      return {
        metrics,
        statusDistribution,
        outcomeTrend: Array.from(byQuarter.values()),
        priorityQueue,
        recentActivity: current.activities.slice(0, 8),
        outdatedCount: outdated.length,
        dueForReviewCount: dueForReview.length,
      };
    },

    async search(query: string): Promise<SearchResult[]> {
      await delay(90);
      const needle = query.trim();
      if (needle.length < 2) return [];
      const current = state();

      const formulaResults: SearchResult[] = current.formulas
        .filter((formula) => matchesQuery(needle, [formula.name, formula.id, formula.category]))
        .slice(0, 5)
        .map((formula) => ({
          id: formula.id,
          kind: 'formula',
          title: formula.name,
          subtitle: `${formula.id} · ${formula.version} · ${formula.category}`,
          to: `/formulas/${formula.id}`,
        }));

      const materialResults: SearchResult[] = current.rawMaterials
        .filter((material) => matchesQuery(needle, [material.name, material.id, material.supplier]))
        .slice(0, 5)
        .map((material) => ({
          id: material.id,
          kind: 'raw-material',
          title: material.name,
          subtitle: `${material.id} · ${material.supplier}`,
          to: `/materials/${material.id}`,
        }));

      const submissionResults: SearchResult[] = current.submissions
        .filter((submission) => matchesQuery(needle, [submission.id, submission.formulaName]))
        .slice(0, 3)
        .map((submission) => ({
          id: submission.id,
          kind: 'submission',
          title: `${submission.id} — ${submission.formulaName}`,
          subtitle: `${submission.version} · recorded outcome ${submission.outcome}`,
          to: `/submissions/${submission.id}`,
        }));

      return [...formulaResults, ...materialResults, ...submissionResults];
    },

    /* ------------------------------------------------------------ evidence */

    async attachLocalFile(input: AttachmentInput) {
      await delay(200);
      const current = state();
      const attachment = { ...input.attachment, attachedBy: currentUserId() };

      let document: EvidenceDocument;
      if (input.documentId) {
        const base = current.documents.find((item) => item.id === input.documentId);
        if (!base) throw new ServiceError(`Document ${input.documentId} was not found.`, false);
        document = { ...base, status: 'available', localAttachment: attachment };
      } else if (input.create) {
        document = {
          id: uid('DOC'),
          title: input.create.title,
          type: input.create.type,
          status: 'available',
          issuedDate: new Date().toISOString(),
          rawMaterialId: input.create.rawMaterialId,
          formulaId: input.create.formulaId,
          supplier: current.rawMaterials.find((item) => item.id === input.create?.rawMaterialId)?.supplier,
          summary:
            'Recorded from a local demo attachment. Only the filename, size and type were stored — the file content was not read or analyzed.',
          localAttachment: attachment,
        };
      } else {
        throw new ServiceError('An attachment needs either an existing document or a new document record.');
      }

      const actions: DemoAction[] = [
        { type: 'document/upsert', document },
        activity({
          type: 'evidence-added',
          summary: `Local attachment recorded for ${document.title}`,
          detail: `${attachment.filename} — content not analyzed.`,
          formulaId: document.formulaId,
          rawMaterialId: document.rawMaterialId,
        }),
      ];

      /* Any screened formula that depends on this document loses its screening currency. */
      if (document.rawMaterialId) {
        for (const formula of current.formulas) {
          const uses = formula.ingredients.some(
            (ingredient) => ingredient.rawMaterialId === document.rawMaterialId,
          );
          if (uses && formula.screeningStatus !== 'not-screened' && formula.screeningCurrent) {
            actions.push({ type: 'formula/upsert', formula: { ...formula, screeningCurrent: false } });
            actions.push({ type: 'run/markOutdated', formulaId: formula.id });
          }
        }
      }

      store.dispatch({ type: 'batch', actions });
      return document;
    },

    async linkFormulaDocument(formulaId: string, documentId: string) {
      await delay(140);
      const formula = requireFormula(formulaId);
      if (formula.evidenceIds.includes(documentId)) return formula;
      const document = state().documents.find((item) => item.id === documentId);
      if (!document) throw new ServiceError(`Document ${documentId} was not found.`, false);

      const updated: Formula = {
        ...formula,
        evidenceIds: [...formula.evidenceIds, documentId],
        updatedAt: new Date().toISOString(),
      };

      store.dispatch({
        type: 'batch',
        actions: [
          { type: 'formula/upsert', formula: updated },
          activity({
            type: 'evidence-added',
            summary: `${document.title} linked to ${formula.name}`,
            formulaId: formula.id,
          }),
        ],
      });
      return updated;
    },

    /* ------------------------------------------------------------ settings */

    async updateSettings(settings: Partial<DemoSettings>) {
      await delay(110);
      store.dispatch({ type: 'settings/update', settings });
      return state().settings;
    },

    async resetDemoData() {
      await delay(260);
      store.reseed();
    },
  };
}

/** Exposed for tests and for the comparison view's text summary. */
export function describeOutcomeTrend(points: OutcomeTrendPoint[]): string {
  if (points.length === 0) return 'No historical submissions are recorded in this workspace.';
  const totals = points.reduce(
    (acc, point) => ({
      AP: acc.AP + point.AP,
      CL: acc.CL + point.CL,
      MDN: acc.MDN + point['More Data Needed'],
    }),
    { AP: 0, CL: 0, MDN: 0 },
  );
  return `Across ${points.length} quarters the synthetic history records ${totals.AP} AP, ${totals.CL} CL and ${totals.MDN} More Data Needed outcomes.`;
}
