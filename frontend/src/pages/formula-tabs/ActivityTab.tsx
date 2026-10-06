import { Link } from 'react-router-dom';
import { useFormulaDetail } from '../FormulaDetailsPage';
import { useDemoSelector } from '../../state/DemoDataProvider';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/States';
import { Badge } from '../../components/ui/Badge';
import { REVIEW_DECISION_LABEL, formatDateTime, formatRelative } from '../../utils/formatting';

export function ActivityTab() {
  const detail = useFormulaDetail();
  const people = useDemoSelector((state) => state.people);
  const { activities, decisions, formula } = detail;

  const actorName = (id: string) => people.find((person) => person.id === id)?.name ?? 'Demo user';

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Activity"
          description="Every creation, edit, screening run and review decision recorded for this formula."
        />
        {activities.length === 0 ? (
          <EmptyState title="No activity recorded" message="Changes you make will be listed here." />
        ) : (
          <ol className="relative px-5 py-4">
            {activities.map((event, index) => (
              <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-brand-400 bg-surface" aria-hidden />
                  {index < activities.length - 1 ? (
                    <span className="my-1 w-px flex-1 bg-line" aria-hidden />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-5 font-medium text-ink">{event.summary}</p>
                  {event.detail ? (
                    <p className="mt-0.5 text-[13px] leading-5 text-muted">{event.detail}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-subtle">
                    {actorName(event.actorId)} · <span className="tabular">{formatDateTime(event.at)}</span>{' '}
                    · {formatRelative(event.at)}
                  </p>
                  {event.runId ? (
                    <Link
                      to={`/formulas/${formula.id}/results/${event.runId}`}
                      className="fi-link mt-1 inline-block text-xs font-medium"
                    >
                      Open screening result
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card>
        <CardHeader title="Review decisions" description="Internal decisions recorded against screening runs." />
        {decisions.length === 0 ? (
          <EmptyState title="No decisions yet" message="Record a decision from a screening result." />
        ) : (
          <ul className="divide-y divide-line">
            {decisions.map((decision) => (
              <li key={decision.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      decision.decision === 'review-complete'
                        ? 'success'
                        : decision.decision === 'return-for-changes'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {REVIEW_DECISION_LABEL[decision.decision]}
                  </Badge>
                  <span className="text-xs text-muted tabular">{formatDateTime(decision.decidedAt)}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-6 text-ink">{decision.note}</p>
                <p className="mt-1 text-xs text-subtle">
                  {actorName(decision.decidedById)} ·{' '}
                  <Link to={`/formulas/${formula.id}/results/${decision.runId}`} className="fi-link">
                    {decision.runId}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
