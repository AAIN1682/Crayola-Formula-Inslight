import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

const STEPS = [
  'Checking rules (CPSIA, ASTM F963, IARC, Prop 65)',
  'Estimating exposure for a young child',
  'Comparing with past review decisions',
  'Writing reasons and fixes',
];

export function ScreeningProgressOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) {
      setActive(0);
      return undefined;
    }
    const timers = STEPS.map((_, index) =>
      window.setTimeout(() => setActive(index), index * 2200),
    );
    return () => timers.forEach(clearTimeout);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="screening-progress-title"
    >
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-raised">
        <h2 id="screening-progress-title" className="text-lg font-semibold text-ink">
          Running pre-check
        </h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((label, index) => {
            const done = index < active;
            const current = index === active;
            return (
              <li key={label} className="flex items-start gap-3 text-sm">
                {done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : current ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand-500" aria-hidden />
                ) : (
                  <span className="mt-1 size-2.5 shrink-0 rounded-full border border-line" aria-hidden />
                )}
                <span className={cn(current ? 'font-medium text-ink' : done ? 'text-muted' : 'text-subtle')}>{label}</span>
              </li>
            );
          })}
        </ol>
        <button type="button" className="sr-only" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
