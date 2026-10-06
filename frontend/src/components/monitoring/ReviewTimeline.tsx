import { Link } from 'react-router-dom';
import type { MonitoringSummary } from '../../types/services';
import { ScreeningBadge } from '../ui/Badge';
import { EmptyState } from '../ui/States';
import { formatDate } from '../../utils/formatting';
import { cn } from '../../utils/cn';

/** Compact horizontal timeline of upcoming scheduled reviews. */
export function ReviewTimeline({ reviews }: { reviews: MonitoringSummary['upcomingReviews'] }) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        title="No reviews scheduled in the next 120 days"
        message="Scheduled review dates appear here as they approach."
      />
    );
  }

  const horizon = Math.max(30, ...reviews.map((review) => review.daysUntil));

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="relative h-7" role="img" aria-label={`Timeline of ${reviews.length} upcoming reviews`}>
        <div className="absolute top-3 right-0 left-0 h-px bg-line" aria-hidden />
        {[0, 30, 60, 90].map((marker) =>
          marker <= horizon ? (
            <span
              key={marker}
              className="absolute top-0 -translate-x-1/2 text-[10px] text-subtle"
              style={{ left: `${Math.min((marker / horizon) * 100, 100)}%` }}
              aria-hidden
            >
              {marker === 0 ? 'today' : `+${marker}d`}
            </span>
          ) : null,
        )}
        {reviews.map((review) => (
          <span
            key={review.formulaId}
            title={`${review.formulaName} · due ${formatDate(review.dueDate)}`}
            className={cn(
              'absolute top-2 size-3 -translate-x-1/2 rounded-full border-2 border-surface',
              review.daysUntil <= 14
                ? 'bg-danger'
                : review.daysUntil <= 30
                  ? 'bg-warning'
                  : 'bg-brand-400',
            )}
            style={{ left: `${Math.min(Math.max((review.daysUntil / horizon) * 100, 1), 99)}%` }}
            aria-hidden
          />
        ))}
      </div>

      <ul className="divide-y divide-line">
        {reviews.map((review) => (
          <li key={review.formulaId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <Link to={`/formulas/${review.formulaId}`} className="fi-link text-[13px] font-medium">
                {review.formulaName}
              </Link>
              <p className="text-xs text-muted tabular">
                {review.version} · due {formatDate(review.dueDate)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ScreeningBadge status={review.screeningStatus} />
              <span
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs font-medium tabular',
                  review.daysUntil <= 14
                    ? 'border-danger-line bg-danger-soft text-danger'
                    : review.daysUntil <= 30
                      ? 'border-warning-line bg-warning-soft text-warning'
                      : 'border-line bg-canvas text-muted',
                )}
              >
                {review.daysUntil <= 0 ? 'Overdue' : `in ${review.daysUntil}d`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
