import type { ReactNode } from 'react';
import { FlaskConical, Info } from 'lucide-react';
import { cn } from '../../utils/cn';

/** Persistent, understated indicator shown in the top bar and sidebar. */
export function DemoWorkspaceTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1 text-[11px] font-medium text-muted',
        className,
      )}
      title="All formulas, findings, thresholds, references and historical outcomes in this workspace are synthetic and illustrative."
    >
      <FlaskConical aria-hidden className="size-3.5 text-accent-500" />
      Demo workspace · Synthetic data
    </span>
  );
}

export type NoticeTone = 'info' | 'warning' | 'neutral' | 'success' | 'danger';

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: 'border-info-line bg-info-soft text-ink',
  warning: 'border-warning-line bg-warning-soft text-ink',
  neutral: 'border-line bg-canvas text-ink',
  success: 'border-success-line bg-success-soft text-ink',
  danger: 'border-danger-line bg-danger-soft text-ink',
};

const NOTICE_ICON: Record<NoticeTone, string> = {
  info: 'text-brand-500',
  warning: 'text-warning',
  neutral: 'text-muted',
  success: 'text-success',
  danger: 'text-danger',
};

/** Inline qualifier used wherever demo results could be mistaken for a real outcome. */
export function Notice({
  tone = 'neutral',
  title,
  children,
  icon,
  className,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3', NOTICE_TONES[tone], className)}>
      <span className={cn('mt-0.5 shrink-0', NOTICE_ICON[tone])}>
        {icon ?? <Info aria-hidden className="size-4" />}
      </span>
      <div className="min-w-0 text-[13px] leading-5">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title ? 'mt-0.5' : undefined, 'text-muted')}>{children}</div>
      </div>
    </div>
  );
}
