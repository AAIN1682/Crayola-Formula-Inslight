import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { DemoSettings, Person } from '../types/domain';
import { createServices, type FormulaInsightServices } from '../services';
import { fetchWorkspace, isWorkspaceApiEnabled } from '../services/workspaceApi';
import { attachWorkspaceSync } from '../services/workspaceSync';
import { createDemoStore, type DemoStore } from './store';
import type { DemoState } from './reducer';

interface DemoContextValue {
  store: DemoStore;
  services: FormulaInsightServices;
}

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

export function DemoDataProvider({ children }: { children: ReactNode }) {
  const value = useMemo<DemoContextValue>(() => {
    const store = createDemoStore();
    return { store, services: createServices(store) };
  }, []);

  useEffect(() => {
    if (!isWorkspaceApiEnabled()) return undefined;
    let cancelled = false;
    fetchWorkspace()
      .then((dataset) => {
        if (!cancelled) value.store.dispatch({ type: 'dataset/replace', dataset });
      })
      .catch(() => {
        // Seed placeholder remains if the backend is unreachable.
      });
    const detachSync = attachWorkspaceSync(value.store);
    return () => {
      cancelled = true;
      detachSync();
    };
  }, [value]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

function useDemoContext(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('Formula Insight hooks must be used inside <DemoDataProvider>.');
  }
  return context;
}

/** Typed access to the data layer. Components never reach past this. */
export function useServices(): FormulaInsightServices {
  return useDemoContext().services;
}

/**
 * Subscribes to a slice of the shared dataset. Selectors must return a stable value
 * (a primitive or an existing reference) rather than building a new object each call.
 */
export function useDemoSelector<T>(selector: (state: DemoState) => T): T {
  const { store } = useDemoContext();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

/** The whole dataset. Prefer `useDemoSelector` unless a view genuinely needs everything. */
export function useDemoState(): DemoState {
  return useDemoSelector((state) => state);
}

/** Increments whenever the dataset changes — used to re-run service queries. */
export function useDataVersion(): number {
  const { store } = useDemoContext();
  return useSyncExternalStore(store.subscribe, store.getRevision, store.getRevision);
}

export function useSettings(): DemoSettings {
  return useDemoSelector((state) => state.settings);
}

export function usePeople(): Person[] {
  return useDemoSelector((state) => state.people);
}

export function useCurrentUser(): Person | undefined {
  return useDemoSelector((state) =>
    state.people.find((person) => person.id === state.settings.currentUserId),
  );
}

export function usePersonName(id?: string): string {
  return useDemoSelector(
    (state) => state.people.find((person) => person.id === id)?.name ?? 'Unassigned',
  );
}
