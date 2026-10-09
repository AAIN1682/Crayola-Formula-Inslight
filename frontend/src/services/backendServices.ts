import type { Formula } from '../types/domain';
import type {
  DashboardSummary,
  FormulaDetail,
  FormulaFilters,
  FormulaInput,
  FormulaRow,
  Paginated,
  SearchResult,
} from '../types/services';
import type { DemoStore } from '../state/store';
import {
  applyPersistedScreeningStatus,
  archiveStoredFormula,
  createStoredFormula,
  duplicateStoredFormula,
  fetchAllFormulas,
  fetchDashboardSummary,
  fetchFormula,
  fetchPersistedScreeningStatuses,
  updateStoredFormula,
} from '../api/formulaBackend';
import { includesAny, paginate, sortRows } from '../utils/filtering';
import { ServiceError, type FormulaInsightServices } from './contracts';
import { createMockServices } from './mock/mockServices';

const PAGE_SIZE = 10;

function asServiceError(error: unknown, fallback: string): ServiceError {
  if (error instanceof ServiceError) return error;
  const message = error instanceof Error ? error.message : fallback;
  return new ServiceError(message);
}

function emptyDetail(formula: Formula): FormulaDetail {
  return {
    formula,
    evidence: { requirements: [], requiredCount: 0, presentCount: 0, missingCount: 0, completeness: 0 },
    documents: [],
    runs: [],
    decisions: [],
    activities: [],
    linkedMaterials: [],
    relatedAlerts: [],
  };
}

/** Stable comparison of the fields a browser edit would change. Screening colors are included. */
export function formulaRecordKey(formula: Formula): string {
  return JSON.stringify({
    id: formula.id,
    name: formula.name,
    version: formula.version,
    category: formula.category,
    ageGroup: formula.ageGroup,
    targetMarkets: formula.targetMarkets,
    physicalForm: formula.physicalForm,
    intendedUse: formula.intendedUse,
    lifecycle: formula.lifecycle,
    screeningStatus: formula.screeningStatus,
    ingredients: formula.ingredients.map((ingredient) => [
      ingredient.rawMaterialId ?? '',
      ingredient.name,
      ingredient.concentration,
    ]),
  });
}

export function createBackendServices(store: DemoStore): FormulaInsightServices {
  const local = createMockServices(store);
  const personName = (id?: string) =>
    store.getState().people.find((person) => person.id === id)?.name ?? 'Unassigned';

  const withStatus = async (formula: Formula) => {
    const saved = await fetchPersistedScreeningStatuses();
    return applyPersistedScreeningStatus(formula, saved[formula.id]);
  };

  return {
    ...local,

    async listFormulas(filters: FormulaFilters = {}): Promise<Paginated<FormulaRow>> {
      try {
        const { formulas, missingEvidence } = await fetchAllFormulas({
          search: filters.query,
          categories: filters.categories,
          reviewStatuses: filters.reviewStatuses,
          ownerIds: filters.ownerIds,
          lifecycle: filters.lifecycle,
        });
        const saved = await fetchPersistedScreeningStatuses();
        let rows = formulas.map((formula) => {
          const current = applyPersistedScreeningStatus(formula, saved[formula.id]);
          const missing = missingEvidence[formula.id] ?? 0;
          return {
            formula: current,
            ownerName: personName(formula.ownerId),
            reviewerName: formula.reviewerId ? personName(formula.reviewerId) : 'Unassigned',
            ingredientCount: formula.ingredients.length,
            missingEvidenceCount: missing,
            evidenceCompleteness: 0,
            mainConcern: '',
          } satisfies FormulaRow;
        });
        rows = rows.filter((row) => {
          if (!includesAny(filters.screeningStatuses, row.formula.screeningStatus)) return false;
          if (filters.onlyOutdated && row.formula.screeningCurrent) return false;
          if (filters.onlyOutdated && row.formula.screeningStatus === 'not-screened') return false;
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
        return paginate(sorted, filters.page ?? 1, filters.pageSize ?? PAGE_SIZE);
      } catch (error) {
        throw asServiceError(error, 'The formula library could not be loaded.');
      }
    },

    async getFormula(id: string): Promise<FormulaDetail> {
      try {
        const saved = await fetchPersistedScreeningStatuses();
        const remote = applyPersistedScreeningStatus(await fetchFormula(id), saved[id]);
        let detail: FormulaDetail;
        try {
          detail = await local.getFormula(id);
        } catch {
          const runs = store
            .getState()
            .runs.filter((run) => run.formulaId === id)
            .sort((left, right) => new Date(right.runAt).getTime() - new Date(left.runAt).getTime());
          detail = { ...emptyDetail(remote), runs, latestRun: runs[0] };
        }
        const matched = saved[id]?.assessment_id
          ? detail.runs.find((run) => run.formulaAssessment?.assessment_id === saved[id]?.assessment_id)
          : undefined;
        const latestRun = matched ?? detail.latestRun;
        return {
          ...detail,
          formula: latestRun ? { ...remote, latestRunId: latestRun.id } : remote,
          latestRun,
        };
      } catch (error) {
        throw asServiceError(error, `Formula ${id} was not found.`);
      }
    },

    async createFormula(input: FormulaInput): Promise<Formula> {
      try {
        return await createStoredFormula(input);
      } catch (error) {
        throw asServiceError(error, 'The formula could not be created.');
      }
    },

    async updateFormula(id: string, input: FormulaInput): Promise<Formula> {
      try {
        return await updateStoredFormula(id, input);
      } catch (error) {
        throw asServiceError(error, 'The formula could not be updated.');
      }
    },

    async duplicateFormula(id: string): Promise<Formula> {
      try {
        return await duplicateStoredFormula(id);
      } catch (error) {
        throw asServiceError(error, 'The formula could not be duplicated.');
      }
    },

    async archiveFormula(id: string): Promise<Formula> {
      try {
        return await archiveStoredFormula(id);
      } catch (error) {
        throw asServiceError(error, 'The formula could not be archived.');
      }
    },

    async getDashboardSummary(): Promise<DashboardSummary> {
      try {
        return await fetchDashboardSummary();
      } catch (error) {
        throw asServiceError(error, 'The overview could not be loaded.');
      }
    },

    async runScreening(formulaId: string, options) {
      try {
        const formula = await fetchFormula(formulaId);
        return await local.runScreening(formulaId, { ...options, formula, updateStoredFormula: false });
      } catch (error) {
        throw asServiceError(error, 'The assessment service could not be reached.');
      }
    },

    async getScreeningResult(runId: string) {
      const stored = store.getState().runs.find((item) => item.id === runId);
      let view;
      try {
        view = await local.getScreeningResult(runId);
      } catch (error) {
        if (!stored) throw error;
        const formula = await fetchFormula(stored.formulaId);
        view = {
          run: stored,
          formula,
          isCurrent: !stored.outdated,
          decisions: store.getState().decisions.filter((decision) => decision.runId === stored.id),
          ownerName: personName(formula.ownerId),
        };
      }
      try {
        const formula = await withStatus(await fetchFormula(view.run.formulaId));
        return { ...view, formula, isCurrent: formula.screeningCurrent && !view.run.outdated };
      } catch {
        return view;
      }
    },

    async search(query: string): Promise<SearchResult[]> {
      const localResults = await local.search(query);
      const needle = query.trim();
      if (needle.length < 2) return localResults;
      try {
        const listed = await fetchAllFormulas({ search: needle });
        const formulas: SearchResult[] = listed.formulas.slice(0, 5).map((formula) => ({
          id: formula.id,
          kind: 'formula',
          title: formula.name,
          subtitle: `${formula.id} · ${formula.version} · ${formula.category}`,
          to: `/formulas/${formula.id}`,
        }));
        return [...formulas, ...localResults.filter((result) => result.kind !== 'formula')];
      } catch {
        return localResults.filter((result) => result.kind !== 'formula');
      }
    },
  };
}
