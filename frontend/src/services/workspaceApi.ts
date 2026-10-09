import type { DemoDataset } from '../types/domain';

const ENABLED = import.meta.env.VITE_USE_WORKSPACE_API === 'true';

export function isWorkspaceApiEnabled(): boolean {
  return ENABLED;
}

export async function fetchWorkspace(): Promise<DemoDataset> {
  const response = await fetch('/api/workspace');
  if (!response.ok) {
    throw new Error('The workspace could not be loaded from the server.');
  }
  return (await response.json()) as DemoDataset;
}

export async function saveWorkspace(dataset: DemoDataset): Promise<void> {
  const response = await fetch('/api/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dataset),
  });
  if (!response.ok) {
    throw new Error('The workspace could not be saved to the server.');
  }
}

export async function resetWorkspaceOnServer(): Promise<DemoDataset> {
  const response = await fetch('/api/workspace/reset', { method: 'POST' });
  if (!response.ok) {
    throw new Error('The workspace could not be reset on the server.');
  }
  return (await response.json()) as DemoDataset;
}
