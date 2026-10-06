import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { useDataVersion } from '../state/DemoDataProvider';

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

/**
 * Runs a service query and keeps it in sync with the shared dataset. Any change to the
 * demo data bumps the revision counter, which re-runs the query so every screen stays
 * consistent after an action.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: DependencyList = []): AsyncState<T> {
  const version = useDataVersion();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: string }>({
    loading: true,
  });

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: undefined }));

    loaderRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : 'The demo data layer did not respond.';
        setState((previous) => ({ data: previous.data, loading: false, error: message }));
      });

    return () => {
      cancelled = true;
    };
    // The loader is held in a ref, so only the declared dependencies drive re-fetching.
  }, [...deps, version, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { data: state.data, loading: state.loading, error: state.error, reload };
}

/** Wraps an async action so a control cannot be triggered twice while it is in flight. */
export function useAsyncAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
): { run: (...args: Args) => Promise<Result | undefined>; pending: boolean } {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (...args: Args) => {
    if (pendingRef.current) return undefined;
    pendingRef.current = true;
    setPending(true);
    try {
      return await actionRef.current(...args);
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  }, []);

  return { run, pending };
}
