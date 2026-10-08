import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoStore, type DemoStore } from '../state/store';
import { createServices } from './index';
import type { FormulaInsightServices } from './contracts';
import type { FormulaInput } from '../types/services';
import type { PackageAssessment } from '../api/formulaBackend';

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
  ageGroup: 'under_12',
  targetMarkets: ['US'],
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

const catalogMaterials = [
  { material_id: 'water', name: 'Water', kind: 'substance' },
  { material_id: 'glow_purple', name: 'Glow in the Dark Purple', kind: 'purchased_mixture' },
  { material_id: 'sodium_benzoate', name: 'Sodium benzoate', kind: 'substance' },
];

const catalogFormula: FormulaInput = {
  name: 'Catalog Paint',
  category: 'Paints',
  ageGroup: 'under_12',
  targetMarkets: ['US'],
  physicalForm: 'Liquid',
  intendedUse: 'Brush application to paper',
  ownerId: 'usr-dana',
  reviewerId: 'usr-marcus',
  version: 'v1.0',
  lifecycle: 'active',
  ingredients: [
    { name: 'Water', rawMaterialId: 'water', concentration: 95.8 },
    { name: 'Glow in the Dark Purple', rawMaterialId: 'glow_purple', concentration: 4, batchId: '230320' },
    { name: 'Sodium benzoate', rawMaterialId: 'sodium_benzoate', concentration: 0.2 },
  ],
  evidenceIds: [],
};

function mockLiveAssessment(body: Record<string, unknown>): PackageAssessment {
  return {
    assessment_id: 'A-LIVE',
    created_at: new Date().toISOString(),
    data_version: '1.0.0',
    data_hash: 'datahash',
    input_hash: 'inputhash',
    input_snapshot: body as PackageAssessment['input_snapshot'],
    screening_status: 'not_assessed',
    regulatory_status: 'not_assessed',
    ap_cl_decision: null,
    acceptance_probability: null,
    model_confidence: null,
    metrics: {
      passed_checks: 0,
      failed_checks: 0,
      not_assessed_checks: 3,
      check_pass_rate_percent: null,
      evidence_coverage_percent: 0,
      metrics_note: 'Verified checks only.',
    },
    regions: { US: { screening_status: 'not_assessed', regulatory_status: 'not_assessed', ap_cl_decision: null } },
    explanation: {
      status: 'generated',
      source: 'azure',
      content: {
        summary: 'No verified applicable threshold is available for the entered catalog materials.',
        finding_explanations: [],
        recommendations: [],
        alerts: [],
        limitations: ['AP/CL are not issued.'],
      },
    },
    execution: {
      assessment_id: 'A-LIVE',
      execution_mode: 'live',
      llm_provider: 'azure_openai',
      llm_status: 'succeeded',
      deployment: 'test-deployment',
      response_id: 'chatcmpl-test',
      request_id: 'req-test',
      generated_at: new Date().toISOString(),
      latency_ms: 12,
      usage: { total_tokens: 20 },
      retrieved_source_count: 2,
      input_hash: 'inputhash',
      data_hash: 'datahash',
    },
    llm_context: {
      checks: [
        {
          check_id: 'US:glow_purple:NO-VERIFIED-THRESHOLD',
          status: 'not_assessed',
          material_id: 'glow_purple',
          region: 'US',
          message: 'No verified applicable threshold available.',
        },
      ],
      calculated_checks: [
        {
          check_id: 'US:glow_purple:NO-VERIFIED-THRESHOLD',
          status: 'not_assessed',
          material_id: 'glow_purple',
          region: 'US',
          message: 'No verified applicable threshold available.',
        },
      ],
      evidence_checks: [],
      documents: [],
      materials: catalogMaterials,
      source_issues: [],
      source_excerpts: [{ source_id: 'DOC-GLOW-P1', document_id: 'DOC-GLOW', filename: 'COA_GLO_PR_JP.pdf', relevant_text: 'Glow in the Dark Purple', review_status: 'unverified' }],
    },
  };
}

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/catalog')) {
      return new Response(JSON.stringify({ materials: catalogMaterials }), { status: 200 });
    }
    if (url.includes('/api/assessments')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify(mockLiveAssessment(body)), { status: 200 });
    }
    return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
  });
}

describe('screening run', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks a completed assessment when legacy identities are unresolved', async () => {
    vi.stubGlobal('fetch', mockFetch());
    await expect(services.runScreening('FML-1001')).rejects.toThrow(/Resolve ingredient identity/i);
  });

  it('does not map RM-103 onto a catalog pigment by name', async () => {
    vi.stubGlobal('fetch', mockFetch());
    await expect(services.runScreening('FML-1001')).rejects.toThrow(/not mapped by name similarity/i);
  });

  it('sends the catalog formula to the live backend and stores Azure provenance', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const created = await services.createFormula(catalogFormula);
    const run = await services.runScreening(created.id);
    const assessCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/assessments'));
    const body = JSON.parse(String(assessCall?.[1]?.body ?? '{}')) as { generate_explanation?: boolean; ingredients: { material_id: string }[] };

    expect(body.generate_explanation).toBe(true);
    expect(body.ingredients.map((item) => item.material_id)).toEqual(['water', 'glow_purple', 'sodium_benzoate']);
    expect(run.legacySample).toBe(false);
    expect(run.aiStatus).toBe('succeeded');
    expect(run.formulaAssessment?.execution?.llm_provider).toBe('azure_openai');
    expect(run.summary).toContain('No verified applicable threshold');
    expect(run.summary).not.toMatch(/demo rule checks|Aqua Base Concentrate|Cyan Dispersion Pigment/i);
    expect(run.evidenceCompleteness).toBe(0);
  });

  it('marks earlier live runs outdated and points the formula at the newest run', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const created = await services.createFormula(catalogFormula);
    const first = await services.runScreening(created.id);
    const second = await services.runScreening(created.id);

    const detail = await services.getFormula(created.id);
    expect(detail.formula.latestRunId).toBe(second.id);
    expect(detail.runs.find((run) => run.id === first.id)?.outdated).toBe(true);
    expect(detail.formula.screeningCurrent).toBe(true);
  });

  it('invalidates the stored result when the formula is edited', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const created = await services.createFormula(catalogFormula);
    const run = await services.runScreening(created.id);
    const detail = await services.getFormula(created.id);
    expect(detail.formula.screeningCurrent).toBe(true);

    await services.updateFormula(created.id, {
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

    const updated = await services.getFormula(created.id);
    expect(updated.formula.screeningCurrent).toBe(false);
    expect(updated.runs.find((item) => item.id === run.id)?.outdated).toBe(true);

    const view = await services.getScreeningResult(run.id);
    expect(view.isCurrent).toBe(false);
  });
});

describe('review decisions', () => {
  it('requires a note', async () => {
    await expect(
      services.saveReviewDecision({ formulaId: 'FML-1001', runId: 'RUN-1001-01', decision: 'review-complete', note: '   ' }),
    ).rejects.toThrow(/review note is required/i);
  });

  it('updates the review status and adds an activity entry', async () => {
    await services.saveReviewDecision({
      formulaId: 'FML-1002',
      runId: 'RUN-1002-01',
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
