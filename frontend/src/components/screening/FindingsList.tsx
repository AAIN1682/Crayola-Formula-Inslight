import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FindingRecord } from '../../types/domain';
import { SeverityBadge, Badge } from '../ui/Badge';
import { EmptyState } from '../ui/States';
import { cn } from '../../utils/cn';

function FindingCard({ finding }: { finding: FindingRecord }) {
  const [open, setOpen] = useState(finding.severity === 'high');

  return (
    <li
      className={cn(
        'rounded-lg border',
        finding.severity === 'high'
          ? 'border-danger-line bg-danger-soft/40'
          : finding.severity === 'medium'
            ? 'border-warning-line bg-warning-soft/40'
            : 'border-line bg-surface',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <SeverityBadge severity={finding.severity} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-ink">{finding.concern}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {finding.scope === 'ingredient' ? 'Ingredient' : 'Formula'} · {finding.reference} ·{' '}
            {finding.ruleId}
          </span>
        </span>
        <span className="text-xs font-medium text-brand-600">{open ? 'Hide finding' : 'View finding'}</span>
        <ChevronDown
          aria-hidden
          className={cn('mt-1 size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-line/70 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Explanation</p>
            <p className="mt-0.5 text-[13px] leading-6 text-ink">{finding.explanation}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
                Evidence reference
              </p>
              <p className="mt-0.5 text-[13px] text-ink">{finding.evidenceReference || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Review status</p>
              <p className="mt-0.5">
                <Badge tone={finding.reviewState === 'resolved' ? 'success' : 'neutral'}>
                  {finding.reviewState === 'open'
                    ? 'Open'
                    : finding.reviewState === 'acknowledged'
                      ? 'Acknowledged'
                      : 'Resolved'}
                </Badge>
              </p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
              Recommended next action
            </p>
            <p className="mt-0.5 text-[13px] leading-6 text-ink">{finding.recommendedAction}</p>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function FindingsList({ findings }: { findings: FindingRecord[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState
        variant="shield"
        title="No findings were raised"
        message="The demo rule checks did not flag anything for this composition."
      />
    );
  }

  return (
    <ul className="space-y-2.5">
      {findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </ul>
  );
}
