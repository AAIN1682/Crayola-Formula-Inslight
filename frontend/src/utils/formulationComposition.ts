import type { CompositionRow } from '../types/newScreening';
import { compositionIsComplete, compositionTotal } from './compositionMath';

export function formulationCompositionRows(rows: CompositionRow[]): CompositionRow[] {
  return rows.filter((row) => row.screeningRole !== 'contaminant_analyte');
}

export function formulationCompositionTotal(rows: CompositionRow[]): number {
  return compositionTotal(formulationCompositionRows(rows));
}

export function formulationCompositionReady(rows: CompositionRow[]): boolean {
  return compositionIsComplete(formulationCompositionTotal(rows));
}
