import type { DemoStore } from '../state/store';
import type { FormulaInsightServices } from './contracts';
import { createBackendServices } from './backendServices';

/**
 * Formula library, formula detail, screening, and overview use the backend.
 * Reviews, monitoring, submissions, documents, and settings stay on the browser dataset.
 * Browser formula records are not uploaded or replaced.
 */
export function createServices(store: DemoStore): FormulaInsightServices {
  return createBackendServices(store);
}

export { ServiceError } from './contracts';
export type { FormulaInsightServices } from './contracts';
