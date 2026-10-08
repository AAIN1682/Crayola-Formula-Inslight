import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  ClipboardList,
  FileWarning,
  Layers,
  Plus,
  TestTubes,
} from 'lucide-react';
import type { ActivityEvent } from '../types/domain';
import { useAsyncData } from '../hooks/useAsyncData';
import { useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, ButtonLink } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { MetricCard } from '../components/ui/MetricCard';
import { SegmentedBar, type Segment } from '../components/ui/SegmentedBar';
import { OutcomeTrendChart } from '../components/charts/OutcomeTrendChart';
import { MoleculeNetwork } from '../components/graphics/Illustrations';
import { PrimaryCell, Table, TBody, Td, Th, THead, TableScroll, Tr } from '../components/ui/Table';
import { ScreeningBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Notice } from '../components/ui/DemoNotice';
import { FormulaFormDrawer } from '../components/formulas/FormulaFormDrawer';
import { SCREENING_STATUS_LABEL, formatRelative } from '../utils/formatting';

const STATUS_SEGMENTS: Record<string, { color: string; textClass: string; filter: string }> = {
  green: { color: '#15803D', textClass: 'text-success', filter: 'green' },
  amber: { color: '#B45309', textClass: 'text-warning', filter: 'amber' },
  red: { color: '#B91C1C', textClass: 'text-danger', filter: 'red' },
  'not-screened': { color: '#CBD5E1', textClass: 'text-muted', filter: 'not-screened' },
};

const ACTIVITY_ICON: Record<ActivityEvent['type'], typeof TestTubes> = {
  'formula-created': Plus,
  'formula-updated': ClipboardList,
  'formula-duplicated': Layers,
  'formula-archived': Layers,
  'screening-run': TestTubes,
  'review-decision': ClipboardList,
  'evidence-added': FileWarning,
  'alert-updated': BellRing,
  'demo-reset': Layers,
};

function activityLink(event: ActivityEvent): string | undefined {
  if (event.runId && event.formulaId) return `/formulas/${event.formulaId}/results/${event.runId}`;
  if (event.formulaId) return `/formulas/${event.formulaId}`;
  if (event.alertId) return `/monitoring/${event.alertId}`;
  if (event.submissionId) return `/submissions/${event.submissionId}`;
  return undefined;
}

export function OverviewPage() {
  const services = useServices();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);

  const { data, loading, error, reload } = useAsyncData(() => services.getDashboardSummary(), []);

  const metricIcons = {
    total: <Layers aria-hidden className="size-4" />,
    'awaiting-review': <ClipboardList aria-hidden className="size-4" />,
    'missing-evidence': <FileWarning aria-hidden className="size-4" />,
    'open-alerts': <BellRing aria-hidden className="size-4" />,
  } as const;

  const segments: Segment[] =
    data?.statusDistribution.map((entry) => ({
      key: entry.status,
      label: SCREENING_STATUS_LABEL[entry.status],
      value: entry.count,
      color: STATUS_SEGMENTS[entry.status]?.color ?? '#CBD5E1',
      textClass: STATUS_SEGMENTS[entry.status]?.textClass ?? 'text-muted',
    })) ?? [];

  const totalActive = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Assessments and formulas that need attention."
        actions={
          <>
            <ButtonLink to="/formulas" variant="secondary">
              Open Formula Library
            </ButtonLink>
            <Button variant="primary" onClick={() => setFormOpen(true)} icon={<Plus aria-hidden className="size-4" />}>
              New Formula
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="relative z-10 max-w-xl">
            <p className="text-[11px] font-semibold tracking-wide text-brand-400 uppercase">Affine</p>
            <h2 className="mt-1 text-xl leading-7 font-semibold text-navy-800">Welcome back, Affine</h2>
            <p className="mt-1.5 text-[13px] leading-6 text-muted">
              Review formulas, evidence, and assessment results for Product Safety & Formulation.
            </p>
            {data ? (
              <p className="mt-3 text-[13px] text-ink">
                <span className="font-semibold tabular">{data.outdatedCount}</span> formula
                {data.outdatedCount === 1 ? '' : 's'} changed since the last screening ·{' '}
                <span className="font-semibold tabular">{data.dueForReviewCount}</span> due for reassessment
                within 30 days.
              </p>
            ) : null}
          </div>
          <MoleculeNetwork className="pointer-events-none h-36 w-full max-w-xs shrink-0 sm:h-40" />
        </div>
      </Card>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !data
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[124px] animate-pulse rounded-card border border-line bg-surface" />
            ))
          : data?.metrics.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                caption={metric.caption}
                to={metric.to}
                icon={metricIcons[metric.key]}
                trend={metric.trend}
                trendLabel={`${metric.label} over the last 6 months`}
                tone={
                  metric.key === 'open-alerts' && metric.value > 0
                    ? 'warning'
                    : metric.key === 'missing-evidence' && metric.value > 0
                      ? 'warning'
                      : 'neutral'
                }
              />
            ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Screening status"
            description="Assessment status across active formulas."
          />
          <CardBody>
            {data ? (
              <>
                <SegmentedBar
                  segments={segments}
                  total={totalActive}
                  summary={`Across ${totalActive} active formulas: ${segments
                    .map((segment) => `${segment.value} ${segment.label}`)
                    .join(', ')}.`}
                  onSegmentClick={(key) => navigate(`/formulas?screening=${key}`)}
                />
                <Notice tone="neutral" className="mt-4">
                  A Green result means the configured checks found no open concerns. It is not a certification
                  and does not guarantee acceptance.
                </Notice>
              </>
            ) : (
              <LoadingState label="Loading status distribution…" rows={2} />
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Submission outcome trend"
            description="Recorded external outcomes, by quarter."
          />
          <CardBody>
            {data ? <OutcomeTrendChart points={data.outcomeTrend} /> : <LoadingState label="Loading trend…" rows={3} />}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Priority review queue"
            description="Ranked by open concerns, outdated results, missing evidence and approaching review dates."
            actions={
              <ButtonLink to="/formulas" size="sm" variant="ghost">
                All formulas
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            }
          />
          {!data ? (
            <LoadingState label="Loading priority queue…" />
          ) : data.priorityQueue.length === 0 ? (
            <EmptyState
              title="Nothing needs attention"
              message="No active formula currently has an open concern, missing evidence or an approaching review date."
              variant="shield"
            />
          ) : (
            <TableScroll>
              <Table caption="Formulas that need attention, ordered by priority">
                <THead>
                  <tr>
                    <Th>Formula</Th>
                    <Th>Category</Th>
                    <Th>Screening</Th>
                    <Th>Main concern</Th>
                    <Th>Reviewer</Th>
                    <Th>Updated</Th>
                    <Th className="text-right">Open</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.priorityQueue.map((row) => (
                    <Tr key={row.formulaId} onClick={() => navigate(`/formulas/${row.formulaId}`)}>
                      <Td>
                        <PrimaryCell title={row.formulaName} subtitle={`${row.formulaId} · ${row.version}`} />
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{row.category}</Td>
                      <Td>
                        <ScreeningBadge status={row.screeningStatus} current={row.screeningCurrent} />
                      </Td>
                      <Td className="max-w-[260px]">
                        <span className="line-clamp-2 text-[13px] text-ink" title={row.mainConcern}>
                          {row.mainConcern}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{row.reviewerName}</Td>
                      <Td className="whitespace-nowrap text-muted tabular">{formatRelative(row.updatedAt)}</Td>
                      <Td className="text-right">
                        <Link
                          to={`/formulas/${row.formulaId}`}
                          className="fi-link inline-flex items-center gap-1 text-[13px] font-medium"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Open
                          <ArrowRight aria-hidden className="size-3.5" />
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Recent activity" description="Latest changes recorded in this workspace." />
          {!data ? (
            <LoadingState label="Loading activity…" rows={4} />
          ) : data.recentActivity.length === 0 ? (
            <EmptyState title="No activity yet" message="Actions you take will appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {data.recentActivity.map((event) => {
                const Icon = ACTIVITY_ICON[event.type] ?? ClipboardList;
                const to = activityLink(event);
                const content = (
                  <div className="flex gap-3 px-5 py-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-soft text-muted">
                      <Icon aria-hidden className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] leading-5 font-medium text-ink">{event.summary}</p>
                      {event.detail ? (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">{event.detail}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-subtle tabular">{formatRelative(event.at)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={event.id}>
                    {to ? (
                      <Link to={to} className="block transition-colors hover:bg-brand-50/60">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <FormulaFormDrawer
        open={formOpen}
        mode="create"
        onClose={() => setFormOpen(false)}
        onSaved={(formula) => navigate(`/formulas/${formula.id}`)}
      />
    </div>
  );
}
