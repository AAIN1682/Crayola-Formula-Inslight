import type { DemoDataset, Formula } from '../../types/domain';
import type { FormulaInput, RunScreeningOptions } from '../../types/services';
import { SCREENING_STAGES } from '../../types/services';
import type { DemoStore } from '../../state/store';
import { ServiceError, type FormulaInsightServices } from '../contracts';
import { createMockServices } from '../mock/mockServices';
import { apiFetch } from './apiClient';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function syncDataset(store: DemoStore): Promise<void> {
  const dataset = await apiFetch<DemoDataset>('/api/dataset');
  store.dispatch({ type: 'dataset/replace', dataset });
}

export function createHttpServices(store: DemoStore): FormulaInsightServices {
  const mock = createMockServices(store);

  const syncMutations = async <T>(work: () => Promise<T>): Promise<T> => {
    const result = await work();
    await syncDataset(store);
    return result;
  };

  return {
    ...mock,

    async createFormula(input: FormulaInput): Promise<Formula> {
      const formula = await syncMutations(() =>
        apiFetch<Formula>('/api/formulas', { method: 'POST', body: JSON.stringify(input) }),
      );
      return formula;
    },

    async updateFormula(id: string, input: FormulaInput): Promise<Formula> {
      return syncMutations(() =>
        apiFetch<Formula>(`/api/formulas/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(input),
        }),
      );
    },

    async runScreening(formulaId: string, options?: RunScreeningOptions) {
      const runPromise = apiFetch<Awaited<ReturnType<FormulaInsightServices['runScreening']>>>(
        `/api/formulas/${encodeURIComponent(formulaId)}/screening/runs`,
        { method: 'POST', signal: options?.signal },
      );

      for (let index = 0; index < SCREENING_STAGES.length; index += 1) {
        if (options?.signal?.aborted) throw new ServiceError('Screening was cancelled.');
        options?.onStage?.(SCREENING_STAGES[index]!, index);
        if (index < SCREENING_STAGES.length - 1) {
          await Promise.race([runPromise.then(() => undefined), delay(index === 0 ? 260 : 320)]);
        }
      }

      const run = await runPromise;
      await syncDataset(store);
      return run;
    },

    async resetDemoData() {
      await apiFetch('/api/dataset/reset', { method: 'POST' });
      await syncDataset(store);
    },
  };
}

export async function bootstrapApiDataset(store: DemoStore): Promise<void> {
  await syncDataset(store);
}
