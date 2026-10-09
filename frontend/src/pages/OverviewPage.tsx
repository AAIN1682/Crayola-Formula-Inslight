import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardList, FileWarning, Layers, Plus } from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import { useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, ButtonLink } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { MetricCard } from '../components/ui/MetricCard';
import { SegmentedBar, type Segment } from '../components/ui/SegmentedBar';
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

export function OverviewPage() {
  const services = useServices();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);

  const { data, loading, error, reload } = useAsyncData(() => services.getDashboardSummary(), []);

  const metricIcons = {
    total: <Layers aria-hidden className="size-4" />,
    'awaiting-review': <ClipboardList aria-hidden className="size-4" />,
    'missing-evidence': <FileWarning aria-hidden className="size-4" />,
  } as const;

  const metrics = data?.metrics ?? [];

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
                {data.outdatedCount === 1 ? '' : 's'} changed since the last screening.
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading && !data
          ? Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-[124px] animate-pulse rounded-card border border-line bg-surface" />
            ))
          : metrics.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                caption={metric.caption}
                to={metric.to}
                icon={metricIcons[metric.key as keyof typeof metricIcons]}
                trend={metric.trend}
                trendLabel={`${metric.label} over the last 6 months`}
                tone={metric.key === 'missing-evidence' && metric.value > 0 ? 'warning' : 'neutral'}
              />
            ))}
      </div>

      <Card>
        <CardHeader title="Screening status" description="Assessment status across active formulas." />
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

      <Card>
        <CardHeader
          title="Priority review queue"
          description="Ranked by open concerns, outdated results, and missing evidence."
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
            message="No active formula currently has an open concern or missing evidence."
            variant="shield"
          />
        ) : (
          <TableScroll>
            <Table caption="Formulas that need attention, ordered by priority">
              <THead>
                <tr>
                  <Th>Formula</Th>
                  <Th>Screening</Th>
                  <Th>Main concern</Th>
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
                    <Td>
                      <ScreeningBadge status={row.screeningStatus} current={row.screeningCurrent} />
                    </Td>
                    <Td className="max-w-[320px]">
                      <span className="line-clamp-2 text-[13px] text-ink" title={row.mainConcern}>
                        {row.mainConcern}
                      </span>
                    </Td>
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

      <FormulaFormDrawer
        open={formOpen}
        mode="create"
        onClose={() => setFormOpen(false)}
        onSaved={(formula) => navigate(`/formulas/${formula.id}`)}
      />
    </div>
  );
}
