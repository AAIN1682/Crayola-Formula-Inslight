import { describe, expect, it } from 'vitest';
import { defaultDraft, emptyCompositionRow } from '../types/newScreening';
import { draftToFormulaInput, mergeIngredientDocumentIds } from './newScreeningSave';

describe('newScreeningSave evidence sync', () => {
  it('merges document ids without dropping existing links', () => {
    expect(mergeIngredientDocumentIds(['a'], ['b'])).toEqual(['a', 'b']);
    expect(mergeIngredientDocumentIds(['a'], ['a', 'c'])).toEqual(['a', 'c']);
  });

  it('includes ingredient and file evidence on formula save payload', () => {
    const draft = defaultDraft();
    draft.name = 'Test';
    draft.targetMarkets = ['US'];
    draft.ingredients = [
      {
        ...emptyCompositionRow(),
        name: 'Water',
        pct: '100',
        sdsAvailable: true,
        documentIds: ['DOC-ING-1'],
      },
    ];
    draft.files = [
      {
        id: 'f1',
        name: 'coa.pdf',
        kind: 'pdf',
        documentType: 'coa',
        status: 'ready',
        documentId: 'DOC-FILE-1',
      },
    ];
    const input = draftToFormulaInput(draft, 'draft');
    expect(input.ingredients[0].evidenceIds).toEqual(['DOC-ING-1']);
    expect(input.evidenceIds).toEqual(expect.arrayContaining(['DOC-ING-1', 'DOC-FILE-1']));
    expect(input.evidenceIds).toHaveLength(2);
  });
});
