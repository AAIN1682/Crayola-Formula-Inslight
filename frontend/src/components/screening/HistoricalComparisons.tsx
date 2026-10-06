import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { HistoricalComparisonRecord } from '../../types/domain';
import { OutcomeBadge } from '../ui/Badge';
import { InfoTooltip } from '../ui/Tooltip';
import { EmptyState } from '../ui/States';
import { Notice } from '../ui/DemoNotice';

export function HistoricalComparisons({
  comparisons,
  currentFormulaId,
}: {
  comparisons: HistoricalComparisonRecord[];
  currentFormulaId: string;
}) {
  if (comparisons.length === 0) {
    return (
      <EmptyState
        variant="search"
        title="No comparable historical records"
        message="No synthetic submission in this workspace shares enough raw materials with this composition."
      />
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {comparisons.map((comparison) => (
          <li key={comparison.submissionId} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">
                  {comparison.formulaName} {comparison.version}
                </p>
                <p className="mt-0.5 text-xs text-muted tabular">{comparison.submissionId}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <OutcomeBadge outcome={comparison.outcome} />
                <span className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-2 py-0.5 text-xs text-muted">
                  Demo ingredient-overlap score
                  <span className="font-semibold text-ink tabular">{comparison.overlapScore}%</span>
                  <InfoTooltip label="How the demo ingredient-overlap score is calculated" align="right">
                    Shared raw materials ÷ distinct raw materials across both records ={' '}
                    {comparison.sharedCount} ÷ {comparison.distinctCount} ={' '}
                    {comparison.overlapScore}%. It describes composition overlap only and says nothing about
                    whether a formula would be accepted.
                  </InfoTooltip>
                </span>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
                Key ingredient differences
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-6 text-muted">
                {comparison.keyDifferences.map((difference) => (
                  <li key={difference}>{difference}</li>
                ))}
              </ul>
            </div>

            <div className="mt-3 flex flex-wrap gap-4">
              <Link
                to={`/submissions/${comparison.submissionId}`}
                className="fi-link inline-flex items-center gap-1 text-[13px] font-medium"
              >
                Open submission record
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
              <Link
                to={`/submissions/${comparison.submissionId}?compare=${currentFormulaId}`}
                className="fi-link inline-flex items-center gap-1 text-[13px] font-medium"
              >
                Compare with this formula
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <Notice tone="warning" title="Historical acceptance does not carry over">
        A recorded outcome applies to the exact composition that was submitted at that time. It does not
        establish acceptance of a modified formula, and ingredient overlap does not predict a result.
      </Notice>
    </div>
  );
}
