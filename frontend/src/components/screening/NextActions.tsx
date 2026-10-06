import { Link } from 'react-router-dom';
import { Beaker, FileSearch, FlaskConical, ListChecks, UserCheck } from 'lucide-react';
import type { NextActionKind, NextActionRecord } from '../../types/domain';
import { EmptyState } from '../ui/States';

const ICONS: Record<NextActionKind, typeof FileSearch> = {
  'request-supplier-documentation': FileSearch,
  'add-laboratory-evidence': Beaker,
  'expert-review': UserCheck,
  'review-alternative': FlaskConical,
  'complete-formula-record': ListChecks,
};

const KIND_LABEL: Record<NextActionKind, string> = {
  'request-supplier-documentation': 'Request supplier documentation',
  'add-laboratory-evidence': 'Add laboratory evidence',
  'expert-review': 'Ask an expert to review',
  'review-alternative': 'Review a historical alternative',
  'complete-formula-record': 'Complete the formula record',
};

export function NextActions({ actions }: { actions: NextActionRecord[] }) {
  if (actions.length === 0) {
    return (
      <EmptyState
        variant="shield"
        title="No follow-up actions"
        message="The demo checks did not produce any outstanding actions for this run."
      />
    );
  }

  return (
    <ol className="space-y-2.5">
      {actions.map((action) => {
        const Icon = ICONS[action.kind];
        const isMaterial = action.relatedReference?.startsWith('RM-');
        return (
          <li key={action.id} className="flex gap-3 rounded-lg border border-line bg-surface p-3.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-brand-500">
              <Icon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
                {KIND_LABEL[action.kind]}
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-ink">{action.label}</p>
              <p className="mt-0.5 text-[13px] leading-6 text-muted">{action.detail}</p>
              {isMaterial ? (
                <Link
                  to={`/materials/${action.relatedReference}`}
                  className="fi-link mt-1 inline-block text-xs font-medium"
                >
                  Open {action.relatedReference}
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
