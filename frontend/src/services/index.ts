import type { DemoStore } from '../state/store';
import type { FormulaInsightServices } from './contracts';
import { isApiMode } from './http/apiClient';
import { createHttpServices } from './http/httpServices';
import { createMockServices } from './mock/mockServices';

/**
 * Single entry point for the data layer.
 *
 * When `VITE_API_BASE_URL` is set, formula create/update, screening (Azure OpenAI), and
 * dataset reset go through the FastAPI backend; other reads use the synced local store.
 */
export function createServices(store: DemoStore): FormulaInsightServices {
  if (isApiMode()) return createHttpServices(store);
  return createMockServices(store);
}

export { ServiceError } from './contracts';
export type { FormulaInsightServices } from './contracts';
