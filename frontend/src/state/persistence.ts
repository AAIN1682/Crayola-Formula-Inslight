import type { DemoDataset, Formula, ScreeningRun } from '../types/domain';
import { createSeedDataset } from '../data/seed';
import { mapLegacyAge } from '../utils/audience';

export const STORAGE_KEY = 'formula-insight.dataset';
export const STORAGE_VERSION = 4;

export const PERSISTENCE_DESCRIPTION =
  'The Formula Library and Overview read formulas and dashboard metrics from the backend. Screening sends the backend formula to the assessment API and keeps that result. Review decisions, monitoring, submissions, documents, and any browser formula edits stay in this browser under "formula-insight.dataset". Browser formulas are not copied over the server, and server formulas are not written back over a different browser copy.';

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
    const ageGroup = run.ageGroup ?? formula?.ageGroup;
    const targetMarkets = run.targetMarkets ?? formula?.targetMarkets ?? ['US'];
    const sampleFindings = run.findings.some((finding) => String(finding.ruleId || '').startsWith('DR-'));
    const liveAzure = run.formulaAssessment?.execution?.llm_status === 'succeeded' && run.formulaAssessment.explanation?.source === 'azure';
    const legacySample = Boolean(run.legacySample) || (!liveAzure && (sampleFindings || !run.formulaAssessment));
    const next: ScreeningRun = {
      ...run,
      ageGroup: ageGroup ?? run.ageGroup,
      targetMarkets,
      marketResults: run.marketResults ?? [
        { market: 'US', status: run.status, findingIds: run.findings.map((finding) => finding.id) },
      ],
      assessmentRequest: run.assessmentRequest ?? (ageGroup ? { target_markets: targetMarkets, age_group: ageGroup } : run.assessmentRequest),
      assessmentMode: run.assessmentMode ?? run.formulaAssessment?.assessment_mode ?? run.formulaAssessment?.input_snapshot?.assessment_mode,
      legacySample,
      outdated: run.outdated || legacySample || !(run.assessmentMode ?? run.formulaAssessment?.assessment_mode ?? run.formulaAssessment?.input_snapshot?.assessment_mode),
    };
    return next;
  });
  const latestLegacy = new Set(
    formulas
      .filter((formula) => {
        const latest = runs.find((run) => run.id === formula.latestRunId);
        return latest?.legacySample;
      })
      .map((formula) => formula.id),
  );
  const nextFormulas = formulas.map((formula) =>
    latestLegacy.has(formula.id) ? { ...formula, screeningCurrent: false } : formula,
  );
  return { ...dataset, formulas: nextFormulas, runs, sourceReviewDrafts: dataset.sourceReviewDrafts ?? [] };
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
