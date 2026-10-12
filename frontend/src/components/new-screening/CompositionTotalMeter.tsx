import { compositionMeterMessage, compositionTotal } from '../../utils/compositionMath';
import { formulationCompositionReady, formulationCompositionTotal } from '../../utils/formulationComposition';

export function compositionReady(rows: { pct: string; screeningRole?: string }[]) {
  return formulationCompositionReady(rows as import('../../types/newScreening').CompositionRow[]);
}

export function CompositionTotalMeter({ rows }: { rows: { pct: string }[] }) {
  const total = formulationCompositionTotal(rows as import('../../types/newScreening').CompositionRow[]);
  const { ok, message } = compositionMeterMessage(total);
  const width = Math.min(100, Math.max(0, total));

  return (
    <div className={`ps-total ${ok ? 'ok' : 'off'}`} aria-live="polite">
      <div className="ps-total-bar">
        <i style={{ width: `${width}%` }} />
      </div>
      <span className="ps-mono">{total.toFixed(3)}%</span>
      <span className="ps-total-msg">{message}</span>
    </div>
  );
}
