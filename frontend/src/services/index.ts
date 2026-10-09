import type { DemoStore } from '../state/store';
import type { FormulaInsightServices } from './contracts';
import { createMockServices } from './mock/mockServices';
import { isWorkspaceApiEnabled, resetWorkspaceOnServer } from './workspaceApi';

/**
 * Single entry point for the data layer.
 *
 * With `VITE_USE_WORKSPACE_API=true`, the UI still uses the in-memory reducer but
 * loads and saves the dataset through `GET/PUT /api/workspace` (files under backend/datanew).
 * Screening catalog routes continue to use `/api/assessments` and related endpoints.
 */
export function createServices(store: DemoStore): FormulaInsightServices {
  const mock = createMockServices(store);
  if (!isWorkspaceApiEnabled()) return mock;
  return {
    ...mock,
    async resetDemoData() {
      const dataset = await resetWorkspaceOnServer();
      store.dispatch({ type: 'dataset/replace', dataset });
    },
  };
}

export { ServiceError } from './contracts';
export type { FormulaInsightServices } from './contracts';
