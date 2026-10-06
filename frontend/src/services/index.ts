import type { DemoStore } from '../state/store';
import type { FormulaInsightServices } from './contracts';
import { createMockServices } from './mock/mockServices';

/**
 * Single entry point for the data layer.
 *
 * The demo runs entirely against the local mock implementation. Replacing this one
 * factory with an HTTP-backed implementation of `FormulaInsightServices` is enough to
 * move the application onto a real backend — no page or component imports the mock
 * directly, and nothing outside `state/` touches localStorage.
 */
export function createServices(store: DemoStore): FormulaInsightServices {
  return createMockServices(store);
}

export { ServiceError } from './contracts';
export type { FormulaInsightServices } from './contracts';
