import type { DemoStore } from '../state/store';
import { isWorkspaceApiEnabled, saveWorkspace } from './workspaceApi';

let syncHandle: number | undefined;
let syncing = false;

export function attachWorkspaceSync(store: DemoStore): () => void {
  if (!isWorkspaceApiEnabled()) return () => undefined;

  return store.subscribe(() => {
    if (typeof window === 'undefined') return;
    if (syncHandle !== undefined) window.clearTimeout(syncHandle);
    syncHandle = window.setTimeout(async () => {
      syncHandle = undefined;
      if (syncing) return;
      syncing = true;
      try {
        await saveWorkspace(store.getState());
      } catch {
        // Keep local state; the next change will retry.
      } finally {
        syncing = false;
      }
    }, 400);
  });
}
