import { describe, expect, it } from 'vitest';
import { createSeedDataset } from '../data/seed';
import type { EvidenceDocument, Formula, ScreeningRun } from '../types/domain';
import { computeScreening, isRunCurrent, snapshotIngredients, summarizeEvidence } from './screening';

const dataset = createSeedDataset();

function formula(id: string): Formula {
  const found = dataset.formulas.find((item) => item.id === id);
  if (!found) throw new Error(`Seed formula ${id} is missing`);
  return found;
}

function screen(subject: Formula, documents: EvidenceDocument[] = dataset.documents) {
  return computeScreening({
    formula: subject,
    rawMaterials: dataset.rawMaterials,
    documents,
    submissions: dataset.submissions,
  });
}

describe('screening status', () => {
  it('returns Green when no concerns are raised and every required document is on file', () => {
    const result = screen(formula('FML-1001'));

    expect(result.status).toBe('green');
    expect(result.evidence.missingCount).toBe(0);
    expect(result.evidence.completeness).toBe(100);
    expect(result.findings.filter((finding) => finding.severity === 'high')).toHaveLength(0);
    expect(result.findings.filter((finding) => finding.severity === 'medium')).toHaveLength(0);
  });

  it('returns Red when a material is routed to expert assessment', () => {
    const result = screen(formula('FML-1005'));

    expect(result.status).toBe('red');
    const high = result.findings.filter((finding) => finding.severity === 'high');
    expect(high.length).toBeGreaterThan(0);
    expect(high.some((finding) => finding.ruleId === 'DR-01')).toBe(true);
    expect(result.nextActions.some((action) => action.kind === 'expert-review')).toBe(true);
  });

  it('returns Red when a concentration is far above the illustrative demo ceiling', () => {
    const result = screen(formula('FML-1015'));

    expect(result.status).toBe('red');
    expect(result.findings.some((finding) => finding.ruleId === 'DR-02')).toBe(true);
  });

  it('never returns Green while a required document is missing', () => {
    const green = formula('FML-1001');
    // Remove the certificate of analysis the demo rules require for a colorant.
    const documents = dataset.documents.filter((document) => document.id !== 'DOC-COA-103');

    const result = screen(green, documents);

    expect(result.evidence.missingCount).toBeGreaterThan(0);
    expect(result.status).not.toBe('green');
    expect(result.status).toBe('amber');
    expect(result.nextActions.some((action) => action.kind === 'request-supplier-documentation')).toBe(true);
  });

  it('treats an outdated document as not on file', () => {
    const result = screen(formula('FML-1016'));
    const outdatedFinding = result.findings.find((finding) => finding.ruleId === 'DR-05');

    expect(result.status).toBe('amber');
    expect(outdatedFinding).toBeDefined();
    expect(result.evidence.completeness).toBeLessThan(100);
  });

  it('flags a new ingredient that has no supporting documents', () => {
    const result = screen(formula('FML-1006'));

    expect(result.status).toBe('amber');
    expect(result.findings.some((finding) => finding.ruleId === 'DR-06')).toBe(true);
  });

  it('marks exposure inputs as not assessed when the underlying record is missing', () => {
    const result = screen(formula('FML-1005'));
    const migration = result.exposureInputs.find((input) => input.key === 'migration-result');

    expect(migration?.available).toBe(false);
    expect(migration?.value).toBeUndefined();
  });

  it('is deterministic — the same inputs produce the same result', () => {
    const first = screen(formula('FML-1002'));
    const second = screen(formula('FML-1002'));

    expect(second.status).toBe(first.status);
    expect(second.summary).toBe(first.summary);
    expect(second.findings.map((finding) => finding.id)).toEqual(
      first.findings.map((finding) => finding.id),
    );
  });

  it('labels historical comparisons without implying they predict an outcome', () => {
    const result = screen(formula('FML-1001'));

    for (const comparison of result.comparisons) {
      expect(comparison.overlapScore).toBeGreaterThanOrEqual(0);
      expect(comparison.overlapScore).toBeLessThanOrEqual(100);
      expect(comparison.sharedCount).toBeLessThanOrEqual(comparison.distinctCount);
    }
  });
});

describe('evidence summary', () => {
  it('cannot resolve requirements for an ingredient with no raw-material reference', () => {
    const draft = formula('FML-1012');
    const summary = summarizeEvidence(draft, dataset.rawMaterials, dataset.documents);

    expect(summary.requirements.some((requirement) => requirement.id.endsWith('-unlinked'))).toBe(true);
    expect(summary.missingCount).toBeGreaterThan(0);
  });
});

describe('screening result invalidation', () => {
  const subject = formula('FML-1001');
  const run: ScreeningRun = {
    id: 'RUN-TEST',
    formulaId: subject.id,
    formulaName: subject.name,
    formulaVersion: subject.version,
    status: 'green',
    evidenceCompleteness: 100,
    requiredEvidenceCount: 1,
    presentEvidenceCount: 1,
    runAt: new Date().toISOString(),
    runBy: 'usr-dana',
    summary: 'test run',
    findings: [],
    exposureInputs: [],
    comparisons: [],
    nextActions: [],
    outdated: false,
    ingredientSnapshot: snapshotIngredients(subject.ingredients),
  };

  it('stays current while the composition and version are unchanged', () => {
    expect(isRunCurrent(subject, run)).toBe(true);
  });

  it('becomes outdated when an ingredient concentration changes', () => {
    const edited: Formula = {
      ...subject,
      ingredients: subject.ingredients.map((ingredient, index) =>
        index === 1 ? { ...ingredient, concentration: ingredient.concentration + 1 } : ingredient,
      ),
    };

    expect(isRunCurrent(edited, run)).toBe(false);
  });

  it('becomes outdated when an ingredient is removed', () => {
    const edited: Formula = { ...subject, ingredients: subject.ingredients.slice(0, -1) };

    expect(isRunCurrent(edited, run)).toBe(false);
  });

  it('becomes outdated when the version changes', () => {
    expect(isRunCurrent({ ...subject, version: 'v9.9' }, run)).toBe(false);
  });

  it('treats a missing run as not current', () => {
    expect(isRunCurrent(subject, undefined)).toBe(false);
  });
});

describe('seeded dataset consistency', () => {
  it('records a screening status that matches a stored run for every screened formula', () => {
    const screened = dataset.formulas.filter((item) => item.screeningStatus !== 'not-screened');

    expect(screened.length).toBeGreaterThan(0);
    for (const item of screened) {
      const run = dataset.runs.find((candidate) => candidate.id === item.latestRunId);
      expect(run, `${item.id} should have a stored run`).toBeDefined();
      expect(run?.status).toBe(item.screeningStatus);
      expect(item.screeningCurrent).toBe(isRunCurrent(item, run));
    }
  });

  it('keeps every ingredient reference pointing at a catalog material or an explicit gap', () => {
    for (const item of dataset.formulas) {
      for (const ingredient of item.ingredients) {
        if (!ingredient.rawMaterialId) continue;
        expect(
          dataset.rawMaterials.some((material) => material.id === ingredient.rawMaterialId),
          `${item.id} references unknown material ${ingredient.rawMaterialId}`,
        ).toBe(true);
      }
    }
  });
});
