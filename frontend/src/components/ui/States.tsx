import type { ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../utils/cn';
import { EmptyBoxArt, SearchArt, ShieldArt } from '../graphics/Illustrations';

export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="px-5 py-6" role="status" aria-live="polite">
      <p className="mb-4 flex items-center gap-2 text-[13px] text-muted">
        <Loader2 aria-hidden className="size-4 animate-spin text-brand-400" />
        {label}
      </p>
      <div className="space-y-2.5" aria-hidden>
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="h-9 animate-pulse rounded-md bg-neutral-soft"
            style={{ opacity: 1 - index * 0.12 }}
          />
        ))}
      </div>
    </div>
  );
}

export function InlineSpinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted" role="status">
      <Loader2 aria-hidden className="size-3.5 animate-spin text-brand-400" />
      {label}
    </span>
  );
}

export function ErrorState({
  title = 'That request did not complete',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" role="alert">
      <ShieldArt className="h-20 w-28" tone="danger" />
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
          {message ?? 'The demo data layer did not return a result.'}
        </p>
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} icon={<RefreshCw aria-hidden className="size-4" />}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
  variant = 'box',
  className,
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  variant?: 'box' | 'search' | 'shield';
  className?: string;
}) {
  const Art = variant === 'search' ? SearchArt : variant === 'shield' ? ShieldArt : EmptyBoxArt;
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <Art className="h-20 w-28" />
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {message ? <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">{message}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
