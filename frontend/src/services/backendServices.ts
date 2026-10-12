import type { Formula } from '../types/domain';
import type {
  DashboardSummary,
  FormulaDetail,
  FormulaFilters,
  FormulaInput,
  SearchResult,
} from '../types/services';
import type { DemoStore } from '../state/store';
import {
  applyPersistedScreeningStatus,
  archiveStoredFormula,
  createStoredFormula,
  duplicateStoredFormula,
  duplicateStoredFormulaVersion,
  deleteStoredFormula,
  restoreStoredFormula,
  fetchAllFormulas,
  fetchFormulaLibrary,
  fetchDashboardSummary,
  fetchFormula,
  fetchPersistedScreeningStatuses,
  updateStoredFormula,
} from '../api/formulaBackend';
import { includesAny } from '../utils/filtering';
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

    async listFormulas(filters: FormulaFilters = {}): Promise<import('../types/services').PaginatedFormulaLibrary> {
      try {
        const library = await fetchFormulaLibrary({
          search: filters.query,
          categories: filters.categories,
          reviewStatuses: filters.reviewStatuses,
          ownerIds: filters.ownerIds,
          lifecycle: filters.lifecycle ?? ['draft', 'active'],
          screeningBand: filters.screeningBand ?? 'all',
          page: filters.page ?? 1,
          pageSize: filters.pageSize ?? PAGE_SIZE,
          sortKey: filters.sortKey ?? 'updatedAt',
          sortDirection: filters.sortDirection ?? 'desc',
        });
        const saved = await fetchPersistedScreeningStatuses();
        let items = library.items.map((row) => ({
          ...row,
          formula: applyPersistedScreeningStatus(row.formula, saved[row.formula.id]),
          ownerName: personName(row.formula.ownerId),
          reviewerName: row.formula.reviewerId ? personName(row.formula.reviewerId) : 'Unassigned',
        }));
        items = items.filter((row) => {
          if (!includesAny(filters.screeningStatuses, row.formula.screeningStatus)) return false;
          if (filters.onlyOutdated && !row.latestRunSummary?.outdated) return false;
          if (filters.onlyMissingEvidence && row.missingEvidenceCount === 0) return false;
          return true;
        });
        return { ...library, items };
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

    async duplicateFormulaVersion(id: string): Promise<Formula> {
      try {
        return await duplicateStoredFormulaVersion(id);
      } catch (error) {
        throw asServiceError(error, 'The formula version could not be created.');
      }
    },

    async restoreFormula(id: string): Promise<Formula> {
      try {
        return await restoreStoredFormula(id);
      } catch (error) {
        throw asServiceError(error, 'The formula could not be restored.');
      }
    },

    async deleteFormula(id: string): Promise<void> {
      try {
        await deleteStoredFormula(id);
      } catch (error) {
        throw asServiceError(error, 'The formula could not be deleted.');
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
      const stored =
        store.getState().runs.find((item) => item.id === runId) ??
        store.getState().runs.find((item) => item.formulaAssessment?.assessment_id === runId);
      let view;
      try {
        view = await local.getScreeningResult(stored?.id ?? runId);
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
