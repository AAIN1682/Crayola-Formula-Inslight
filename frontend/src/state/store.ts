import type { DemoDataset } from '../types/domain';
import { createSeedDataset } from '../data/seed';
import { loadDataset, saveDataset } from './persistence';
import { demoReducer, type DemoAction, type DemoState } from './reducer';

export interface DemoStore {
  getState: () => DemoState;
  /** Monotonic counter bumped on every committed change. */
  getRevision: () => number;
  dispatch: (action: DemoAction) => void;
  subscribe: (listener: () => void) => () => void;
  /** Replaces the whole dataset with a fresh seed, clearing persisted changes. */
  reseed: () => DemoDataset;
}

/**
 * A tiny reducer-backed store. Using an external store (rather than `useReducer` alone)
 * keeps reads synchronous, so a service call can act on the result of the call before it.
 */
export function createDemoStore(): DemoStore {
  let state: DemoState = loadDataset().dataset;
  let revision = 0;
  const listeners = new Set<() => void>();
  let persistHandle: number | undefined;

  const schedulePersist = () => {
    if (typeof window === 'undefined') return;
    if (persistHandle !== undefined) window.clearTimeout(persistHandle);
    persistHandle = window.setTimeout(() => {
      persistHandle = undefined;
      saveDataset(state);
    }, 150);
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    getRevision: () => revision,
    dispatch(action) {
      const next = demoReducer(state, action);
      if (next === state) return;
      state = next;
      revision += 1;
      schedulePersist();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reseed() {
      const dataset = createSeedDataset();
      state = dataset;
      revision += 1;
      saveDataset(state);
      notify();
      return dataset;
    },
  };
}
