import { formulationCompositionTotal } from '../../utils/formulationComposition';
import { compositionIsComplete } from '../../utils/compositionMath';

export function CompositionTotalMeter({ rows }: { rows: { pct: string }[] }) {
  const total = formulationCompositionTotal(rows as import('../../types/newScreening').CompositionRow[]);
  const ok = compositionIsComplete(total);
  const width = Math.min(100, Math.max(0, total));

  return (
    <div className={`ps-total ${ok ? 'ok' : 'off'}`} aria-live="polite">
      <div className="ps-total-bar">
        <i style={{ width: `${width}%` }} />
      </div>
      <span className="ps-mono">{total.toFixed(3)}%</span>
    </div>
  );
}
