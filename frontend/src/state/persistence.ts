import type { DemoDataset } from '../types/domain';
import { createSeedDataset } from '../data/seed';

export const STORAGE_KEY = 'formula-insight.dataset';
export const STORAGE_VERSION = 1;

export const PERSISTENCE_DESCRIPTION =
  'Changes you make — formulas, drafts, screening runs, review decisions, alerts and activity — are stored in this browser only, under the key "formula-insight.dataset". Nothing is sent anywhere.';

interface Envelope {
  version: number;
  savedAt: string;
  dataset: DemoDataset;
}

const REQUIRED_COLLECTIONS = [
  'people',
  'formulas',
  'rawMaterials',
  'documents',
  'submissions',
  'alerts',
  'runs',
  'decisions',
  'activities',
] as const;

function isValidDataset(value: unknown): value is DemoDataset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const collectionsOk = REQUIRED_COLLECTIONS.every((key) => Array.isArray(candidate[key]));
  const settings = candidate.settings as Record<string, unknown> | undefined;
  const settingsOk =
    !!settings && typeof settings.currentUserId === 'string' && typeof settings.tableDensity === 'string';
  return collectionsOk && settingsOk;
}

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * Reads the persisted dataset. Any absent, unreadable, outdated or structurally invalid
 * payload falls back to a fresh seed so the demo always starts in a usable state.
 */
export function loadDataset(): { dataset: DemoDataset; restored: boolean } {
  if (apiModeActive()) return { dataset: createSeedDataset(), restored: false };
  if (!storageAvailable()) return { dataset: createSeedDataset(), restored: false };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dataset: createSeedDataset(), restored: false };

    const parsed = JSON.parse(raw) as Partial<Envelope>;
    if (parsed.version !== STORAGE_VERSION || !isValidDataset(parsed.dataset)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return { dataset: createSeedDataset(), restored: false };
    }

    return { dataset: parsed.dataset, restored: true };
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Nothing further we can do; fall through to the seed. */
    }
    return { dataset: createSeedDataset(), restored: false };
  }
}

function apiModeActive(): boolean {
  const raw = import.meta.env.VITE_API_BASE_URL;
  return typeof raw === 'string' && raw.trim().length > 0;
}

export function saveDataset(dataset: DemoDataset): void {
  if (apiModeActive()) return;
  if (!storageAvailable()) return;
  try {
    const envelope: Envelope = { version: STORAGE_VERSION, savedAt: new Date().toISOString(), dataset };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    /* Quota or privacy-mode failures should never break the UI. */
  }
}

export function clearDataset(): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Ignored by design. */
  }
}

export function lastSavedAt(): string | undefined {
  if (!storageAvailable()) return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return (JSON.parse(raw) as Partial<Envelope>).savedAt;
  } catch {
    return undefined;
  }
}
