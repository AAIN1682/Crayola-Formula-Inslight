import type { Formula, PhysicalForm } from '../types/domain';
import { PHYSICAL_FORMS } from '../types/domain';
import type { FormulaInput } from '../types/services';
import type { NewScreeningDraft } from '../types/newScreening';
import { ageGroupForGrade } from '../types/newScreening';
import { compositionIsComplete, compositionTotal } from './compositionMath';
import { draftSaveRows } from './newScreeningValidation';

function resolvePhysicalForm(text: string): PhysicalForm {
  const normalized = text.trim().toLowerCase();
  const match = PHYSICAL_FORMS.find((item) => item.toLowerCase() === normalized);
  if (match) return match;
  if (normalized.includes('solid') || normalized.includes('stick')) return 'Solid stick';
  if (normalized.includes('powder')) return 'Powder';
  if (normalized.includes('gel')) return 'Gel';
  if (normalized.includes('paste')) return 'Paste';
  return 'Liquid';
}

export function mergeIngredientDocumentIds(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming.filter(Boolean)]));
}

export function draftToFormulaInput(draft: NewScreeningDraft, lifecycle: 'draft' | 'active' = 'draft'): FormulaInput {
  const ageGroup = ageGroupForGrade(draft.ageGrade);
  const fileEvidence = draft.files.map((file) => file.documentId).filter((id): id is string => Boolean(id));
  const rows = draftSaveRows(draft);
  const ingredientEvidence = rows.flatMap((row) => row.documentIds);
  const evidenceIds = Array.from(new Set([...fileEvidence, ...ingredientEvidence]));
  const total = compositionTotal(rows.length ? rows : draft.ingredients);
  const compositionCompleteness = compositionIsComplete(total) ? 'complete' : 'partial';
  return {
    name: draft.name.trim() || 'Untitled formula',
    version: 'v1.0',
    category: draft.category,
    ageGroup,
    targetMarkets: draft.targetMarkets.length ? draft.targetMarkets : ['US'],
    physicalForm: resolvePhysicalForm(draft.physicalForm || 'Liquid'),
    intendedUse: draft.intendedUse.trim() || 'Draft formula — intended use to be confirmed.',
    ownerId: '',
    lifecycle,
    compositionCompleteness,
    intendedAgeDetail: draft.ageGrade ? `Ages ${draft.ageGrade}` : undefined,
    ingredients: rows
      .filter((row) => {
        if (lifecycle === 'draft') return true;
        const pct = Number.parseFloat(row.pct);
        return Number.isFinite(pct) && pct > 0;
      })
      .map((row) => ({
        name: row.name.trim() || 'Unnamed ingredient',
        rawMaterialId: row.custom ? undefined : row.catalogId,
        concentration: Number.parseFloat(row.pct) || 0,
        supplier: row.supplier.trim() || undefined,
        notes: row.custom ? 'Not in catalog' : undefined,
        screeningRole: row.screeningRole,
        evidenceIds: [...row.documentIds],
      })),
    evidenceIds,
    ...(draft.formulaCode.trim() ? { formulaCode: draft.formulaCode.trim() } : {}),
    ...(draft.productColor ? { productColor: draft.productColor } : {}),
  } as FormulaInput & { formulaCode?: string; productColor?: string };
}

export function formulaToDraft(formula: Formula): NewScreeningDraft {
  const ageMatch = formula.intendedAgeDetail?.match(/(\d+\+)/);
  return {
    formulaId: formula.id,
    name: formula.name,
    formulaCode: formula.formulaCode ?? '',
    category: formula.category,
    physicalForm: formula.physicalForm,
    ageGrade: ageMatch?.[1] ?? '3+',
    ageGroup: formula.ageGroup,
    productColor: formula.productColor ?? '#3B82F6',
    intendedUse: formula.intendedUse,
    targetMarkets: [...formula.targetMarkets],
    ingredients: formula.ingredients.map((ingredient) => ({
      key: ingredient.id,
      catalogId: ingredient.notes === 'Not in catalog' ? undefined : ingredient.rawMaterialId,
      custom: ingredient.notes === 'Not in catalog' || !ingredient.rawMaterialId,
      name: ingredient.name,
      cas: '-',
      functionLabel: '-',
      pct: String(ingredient.concentration),
      supplier: ingredient.supplier ?? '',
      sdsAvailable: (ingredient.evidenceIds?.length ?? 0) > 0,
      coaAvailable: false,
      documentIds: [...(ingredient.evidenceIds ?? [])],
    })),
    files: [],
  };
}
