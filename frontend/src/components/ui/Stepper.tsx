import type { ReactNode } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export type StepState = 'pending' | 'active' | 'done' | 'error';

export interface StepDescriptor {
  id: string;
  label: string;
  description?: ReactNode;
}

/** Vertical progress stepper used by the screening run dialog. */
export function ProgressStepper({
  steps,
  stateFor,
  className,
}: {
  steps: StepDescriptor[];
  stateFor: (step: StepDescriptor, index: number) => StepState;
  className?: string;
}) {
  return (
    <ol className={cn('space-y-1', className)}>
      {steps.map((step, index) => {
        const state = stateFor(step, index);
        const isLast = index === steps.length - 1;
        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors',
                  state === 'done' && 'border-success-line bg-success-soft text-success',
                  state === 'active' && 'border-brand-400 bg-brand-50 text-brand-500',
                  state === 'error' && 'border-danger-line bg-danger-soft text-danger',
                  state === 'pending' && 'border-line bg-surface text-subtle',
                )}
                aria-hidden
              >
                {state === 'done' ? (
                  <Check className="size-3.5" />
                ) : state === 'active' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  index + 1
                )}
              </span>
              {!isLast ? (
                <span
                  className={cn(
                    'my-1 w-px flex-1 transition-colors',
                    state === 'done' ? 'bg-success-line' : 'bg-line',
                  )}
                  aria-hidden
                />
              ) : null}
            </div>
            <div className={cn('pb-4', isLast && 'pb-0')}>
              <p
                className={cn(
                  'text-[13px] leading-7 font-medium',
                  state === 'pending' ? 'text-subtle' : 'text-ink',
                )}
              >
                {step.label}
                <span className="sr-only">
                  {state === 'done'
                    ? ' — complete'
                    : state === 'active'
                      ? ' — in progress'
                      : ' — waiting'}
                </span>
              </p>
              {step.description ? (
                <p className="text-xs leading-5 text-muted">{step.description}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Horizontal stepper used by the multi-step New Formula flow. */
export function FormStepper({
  steps,
  current,
  furthest,
  onSelect,
}: {
  steps: StepDescriptor[];
  current: number;
  furthest: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Formula creation steps">
      {steps.map((step, index) => {
        const reachable = index <= furthest;
        const active = index === current;
        const done = index < current;
        return (
          <li key={step.id} className="flex items-center">
            <button
              type="button"
              onClick={() => reachable && onSelect(index)}
              disabled={!reachable}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                active && 'bg-info-soft text-brand-500',
                !active && reachable && 'text-muted hover:bg-neutral-soft hover:text-ink',
                !reachable && 'cursor-not-allowed text-subtle',
              )}
            >
              <span
                className={cn(
                  'flex size-5.5 items-center justify-center rounded-full border text-[11px] font-semibold',
                  done && 'border-brand-400 bg-brand-400 text-white',
                  active && !done && 'border-brand-400 text-brand-500',
                  !active && !done && 'border-line text-subtle',
                )}
                aria-hidden
              >
                {done ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {index < steps.length - 1 ? (
              <span className="mx-1 h-px w-4 bg-line sm:w-6" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
