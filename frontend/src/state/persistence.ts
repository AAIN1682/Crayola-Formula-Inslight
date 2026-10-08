import type { DemoDataset, Formula, ScreeningRun } from '../types/domain';
import { createSeedDataset } from '../data/seed';
import { mapLegacyAge } from '../utils/audience';

export const STORAGE_KEY = 'formula-insight.dataset';
export const STORAGE_VERSION = 2;

export const PERSISTENCE_DESCRIPTION =
  'Formulas, assessment runs, review decisions, and activity stay in this browser under the key "formula-insight.dataset". That history is not shared server-side storage. A catalog assessment is sent to the application server to run the checks and request an explanation; the server does not keep the run.';

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

function migrateDataset(dataset: DemoDataset): DemoDataset {
  const formulas = dataset.formulas.map((formula) => {
    const mapped = mapLegacyAge(formula.recordedAgeGroup ?? formula.ageGroup);
    const next: Formula = {
      ...formula,
      ageGroup: mapped.needsSelection ? formula.ageGroup : (mapped.ageGroup ?? formula.ageGroup),
      recordedAgeGroup: formula.recordedAgeGroup ?? mapped.recordedAgeGroup,
      ageGroupNeedsSelection: mapped.needsSelection || formula.ageGroupNeedsSelection,
      targetMarkets: formula.targetMarkets?.length ? formula.targetMarkets : ['US'],
    };
    if (mapped.needsSelection) next.ageGroupNeedsSelection = true;
    return next;
  });
  const byId = new Map(formulas.map((formula) => [formula.id, formula]));
  const runs = dataset.runs.map((run) => {
    const formula = byId.get(run.formulaId);
    if (run.assessmentRequest && run.marketResults && run.ageGroup && run.targetMarkets) return run;
    const ageGroup = run.ageGroup ?? formula?.ageGroup;
    const targetMarkets = run.targetMarkets ?? formula?.targetMarkets ?? ['US'];
    if (!ageGroup) return run;
    const next: ScreeningRun = {
      ...run,
      ageGroup,
      targetMarkets,
      marketResults: run.marketResults ?? [
        { market: 'US', status: run.status, findingIds: run.findings.map((finding) => finding.id) },
      ],
      assessmentRequest: run.assessmentRequest ?? { target_markets: targetMarkets, age_group: ageGroup },
    };
    return next;
  });
  return { ...dataset, formulas, runs };
}

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
  if (!storageAvailable()) return { dataset: createSeedDataset(), restored: false };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dataset: createSeedDataset(), restored: false };

    const parsed = JSON.parse(raw) as Partial<Envelope>;
    if (!isValidDataset(parsed.dataset)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return { dataset: createSeedDataset(), restored: false };
    }

    if (parsed.version !== STORAGE_VERSION) {
      return { dataset: migrateDataset(parsed.dataset), restored: true };
    }

    return { dataset: migrateDataset(parsed.dataset), restored: true };
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Nothing further we can do; fall through to the seed. */
    }
    return { dataset: createSeedDataset(), restored: false };
  }
}

export function saveDataset(dataset: DemoDataset): void {
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
