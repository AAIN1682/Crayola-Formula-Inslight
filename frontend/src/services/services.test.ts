import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoStore, type DemoStore } from '../state/store';
import { createServices } from './index';
import type { FormulaInsightServices } from './contracts';
import type { FormulaInput } from '../types/services';

/**
 * Behavioural checks for the data layer: the flows a reviewer actually performs.
 * The mock implementation runs against the in-memory store, so no browser is needed.
 */

let store: DemoStore;
let services: FormulaInsightServices;

beforeEach(() => {
  store = createDemoStore();
  services = createServices(store);
});

const newFormula: FormulaInput = {
  name: 'ColorFlow Test Marker',
  category: 'Markers',
  ageGroup: '6+',
  physicalForm: 'Liquid',
  intendedUse: 'Brush-tip marker for lettering and illustration on paper and card.',
  ownerId: 'usr-dana',
  reviewerId: 'usr-marcus',
  version: 'v1.0',
  lifecycle: 'active',
  ingredients: [
    { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101', concentration: 69.2 },
    { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 17.5 },
    { name: 'Cyan Dispersion Pigment C-14', rawMaterialId: 'RM-103', concentration: 8.4 },
    { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 3.5 },
    { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.95 },
    { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.45 },
  ],
  evidenceIds: [],
};

describe('formula lifecycle', () => {
  it('creates a formula, records activity, and lists it', async () => {
    const before = await services.listFormulas();
    const created = await services.createFormula(newFormula);
    const after = await services.listFormulas();

    expect(created.id).toMatch(/^FML-\d+$/);
    expect(after.total).toBe(before.total + 1);
    expect(store.getState().activities[0]?.formulaId).toBe(created.id);
  });

  it('duplicates a formula as an unscreened draft', async () => {
    const copy = await services.duplicateFormula('FML-1001');

    expect(copy.name).toBe('ColorFlow Washable Marker (copy)');
    expect(copy.lifecycle).toBe('draft');
    expect(copy.screeningStatus).toBe('not-screened');
    expect(copy.latestRunId).toBeUndefined();
    expect(copy.ingredients).toHaveLength(7);
  });

  it('hides an archived formula from the default library view', async () => {
    const before = await services.listFormulas();
    await services.archiveFormula('FML-1001');
    const after = await services.listFormulas();
    const withArchived = await services.listFormulas({ lifecycle: ['draft', 'active', 'archived'] });

    expect(after.total).toBe(before.total - 1);
    expect(withArchived.total).toBe(before.total);
  });
});

describe('screening run', () => {
  it('reports every stage and stores a deterministic result', async () => {
    const stages: string[] = [];
    const run = await services.runScreening('FML-1001', { onStage: (stage) => stages.push(stage) });

    expect(stages).toEqual([
      'Validate formula inputs',
      'Check illustrative rules',
      'Check exposure-data readiness',
      'Retrieve historical comparisons',
      'Prepare review summary',
    ]);
    expect(run.status).toBe('green');

    const second = await services.runScreening('FML-1001');
    expect(second.status).toBe(run.status);
    expect(second.findings.map((finding) => finding.id)).toEqual(run.findings.map((f) => f.id));
  });

  it('marks earlier runs outdated and points the formula at the newest run', async () => {
    const first = await services.runScreening('FML-1003');
    const second = await services.runScreening('FML-1003');

    const detail = await services.getFormula('FML-1003');
    expect(detail.formula.latestRunId).toBe(second.id);
    expect(detail.runs.find((run) => run.id === first.id)?.outdated).toBe(true);
    expect(detail.formula.screeningCurrent).toBe(true);
  });

  it('cannot reach Green while required evidence is missing, and does once it is on file', async () => {
    const before = await services.runScreening('FML-1002');
    expect(before.status).toBe('amber');
    expect(before.presentEvidenceCount).toBeLessThan(before.requiredEvidenceCount);

    // The superseded safety data sheet is replaced…
    await services.attachLocalFile({
      documentId: 'DOC-SDS-109',
      attachment: {
        filename: 'ns7-sds-rev4.pdf',
        sizeBytes: 182_000,
        mimeType: 'application/pdf',
        attachedAt: new Date().toISOString(),
      },
    });
    // …and the outstanding certificate of analysis is recorded.
    await services.attachLocalFile({
      create: {
        title: 'Certificate of Analysis — Magenta Dispersion Pigment M-21',
        type: 'Certificate of Analysis',
        rawMaterialId: 'RM-104',
      },
      attachment: {
        filename: 'm21-coa.pdf',
        sizeBytes: 94_000,
        mimeType: 'application/pdf',
        attachedAt: new Date().toISOString(),
      },
    });

    const after = await services.runScreening('FML-1002');
    expect(after.evidenceCompleteness).toBe(100);
    expect(after.status).toBe('green');
  });

  it('invalidates the stored result when the formula is edited', async () => {
    const run = await services.runScreening('FML-1003');
    const detail = await services.getFormula('FML-1003');
    expect(detail.formula.screeningCurrent).toBe(true);

    await services.updateFormula('FML-1003', {
      name: detail.formula.name,
      category: detail.formula.category,
      ageGroup: detail.formula.ageGroup,
      physicalForm: detail.formula.physicalForm,
      intendedUse: detail.formula.intendedUse,
      ownerId: detail.formula.ownerId,
      version: detail.formula.version,
      lifecycle: 'active',
      ingredients: detail.formula.ingredients.map((ingredient, index) => ({
        id: ingredient.id,
        name: ingredient.name,
        rawMaterialId: ingredient.rawMaterialId,
        concentration: index === 1 ? ingredient.concentration + 2 : ingredient.concentration,
      })),
      evidenceIds: detail.formula.evidenceIds,
    });

    const updated = await services.getFormula('FML-1003');
    expect(updated.formula.screeningCurrent).toBe(false);
    expect(updated.runs.find((item) => item.id === run.id)?.outdated).toBe(true);

    const view = await services.getScreeningResult(run.id);
    expect(view.isCurrent).toBe(false);
  });
});

describe('review decisions', () => {
  it('requires a note', async () => {
    const run = await services.runScreening('FML-1001');
    await expect(
      services.saveReviewDecision({ formulaId: 'FML-1001', runId: run.id, decision: 'review-complete', note: '   ' }),
    ).rejects.toThrow(/review note is required/i);
  });

  it('updates the review status and adds an activity entry', async () => {
    const run = await services.runScreening('FML-1002');
    await services.saveReviewDecision({
      formulaId: 'FML-1002',
      runId: run.id,
      decision: 'request-evidence',
      note: 'Holding until the magenta certificate of analysis arrives.',
    });

    const detail = await services.getFormula('FML-1002');
    expect(detail.formula.reviewStatus).toBe('awaiting-evidence');
    expect(detail.decisions[0]?.decision).toBe('request-evidence');
    expect(detail.activities[0]?.type).toBe('review-decision');
  });
});

describe('monitoring', () => {
  it('requires a note before an alert can be resolved', async () => {
    await expect(
      services.updateMonitoringAlert('ALR-3001', { status: 'resolved' }),
    ).rejects.toThrow(/note is required/i);
  });

  it('updates the open count when an alert is acknowledged', async () => {
    const before = await services.listMonitoringAlerts();
    await services.updateMonitoringAlert('ALR-3001', { status: 'acknowledged' });
    const after = await services.listMonitoringAlerts();

    expect(after.openCount).toBe(before.openCount - 1);
    expect(after.acknowledgedCount).toBe(before.acknowledgedCount + 1);
  });

  it('creates a labelled simulated alert that affects real formulas', async () => {
    const before = await services.listMonitoringAlerts();
    const alert = await services.simulateMonitoringUpdate();
    const after = await services.listMonitoringAlerts();

    expect(alert.simulated).toBe(true);
    expect(alert.affectedFormulaIds.length).toBeGreaterThan(0);
    expect(after.openCount).toBe(before.openCount + 1);
    expect(after.affectedFormulaCount).toBeGreaterThanOrEqual(before.affectedFormulaCount);
  });

  it('schedules affected formulas when a reassessment task is created', async () => {
    await services.updateMonitoringAlert('ALR-3002', {
      status: 'acknowledged',
      createReassessmentTask: true,
    });

    const detail = await services.getFormula('FML-1010');
    expect(detail.formula.reviewStatus).toBe('in-review');
    expect(detail.formula.nextReviewDate).toBeDefined();
  });
});

describe('dashboard summary', () => {
  it('derives every metric from the shared dataset and reacts to changes', async () => {
    const before = await services.getDashboardSummary();
    const totalBefore = before.metrics.find((metric) => metric.key === 'total')?.value ?? 0;

    await services.createFormula(newFormula);

    const after = await services.getDashboardSummary();
    const totalAfter = after.metrics.find((metric) => metric.key === 'total')?.value ?? 0;

    expect(totalAfter).toBe(totalBefore + 1);
    expect(after.statusDistribution.reduce((sum, entry) => sum + entry.count, 0)).toBe(totalAfter);
    expect(after.outcomeTrend.length).toBeGreaterThan(0);
  });
});

describe('demo data reset', () => {
  it('restores the original seed dataset', async () => {
    await services.createFormula(newFormula);
    await services.archiveFormula('FML-1001');
    const changed = await services.listFormulas({ lifecycle: ['draft', 'active', 'archived'] });

    await services.resetDemoData();

    const restored = await services.listFormulas({ lifecycle: ['draft', 'active', 'archived'] });
    expect(restored.total).toBe(changed.total - 1);
    expect(restored.items.some((row) => row.formula.id === 'FML-1001')).toBe(true);

    const reverted = await services.getFormula('FML-1001');
    expect(reverted.formula.lifecycle).toBe('active');
  });
});

describe('search and comparison', () => {
  it('searches formulas, raw materials and submissions', async () => {
    const results = await services.search('ColorFlow');

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.to.startsWith('/'))).toBe(true);
    expect(results.some((result) => result.kind === 'formula')).toBe(true);
  });

  it('describes shared, added, removed and changed ingredients', async () => {
    const comparison = await services.compareFormulas('FML-1001', 'SUB-2301');

    expect(comparison.rows.length).toBeGreaterThan(0);
    expect(comparison.sharedCount).toBeGreaterThan(0);
    expect(comparison.changedCount).toBeGreaterThan(0);
    expect(comparison.overlapScore).toBeGreaterThan(0);
    expect(comparison.overlapScore).toBeLessThanOrEqual(100);
  });
});
