import { describe, expect, it, vi } from 'vitest';
import { defaultDraft, emptyCompositionRow } from '../types/newScreening';
import { runPrecheckBlockers } from './newScreeningValidation';

describe('runPrecheckBlockers', () => {
  it('lists missing name, markets, and total', () => {
    const draft = defaultDraft();
    draft.ingredients = [{ ...emptyCompositionRow(), pct: '50' }];
    const reasons = runPrecheckBlockers(draft);
    expect(reasons.some((r) => r.includes('product name'))).toBe(true);
    expect(reasons.some((r) => r.includes('market'))).toBe(true);
    expect(reasons.some((r) => r.includes('100'))).toBe(true);
  });

  it('flags custom ingredient without a name', () => {
    const draft = defaultDraft();
    draft.name = 'Test';
    draft.targetMarkets = ['US'];
    draft.ingredients = [{ ...emptyCompositionRow(), custom: true, pct: '100' }];
    expect(runPrecheckBlockers(draft).some((r) => r.includes('custom ingredient name'))).toBe(true);
  });
});

describe('save draft API failure message', () => {
  it('surfaces backend validation text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Invalid payload for formula.' }), { status: 422 })),
    );
    const { createStoredFormula } = await import('../api/formulaBackend');
    await expect(
      createStoredFormula({
        name: 'X',
        intendedUse: 'Test',
        ownerId: '',
        ingredients: [],
        evidenceIds: [],
      }),
    ).rejects.toThrow('Invalid payload for formula.');
    vi.unstubAllGlobals();
  });
});
