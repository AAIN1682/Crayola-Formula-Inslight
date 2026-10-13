import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import { useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { ButtonLink } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { OverviewKpiSummary, statusCountsFromDistribution } from '../components/overview/OverviewKpiSummary';
import { SegmentedBar, type Segment } from '../components/ui/SegmentedBar';
import { PrimaryCell, Table, TBody, Td, Th, THead, TableScroll, Tr } from '../components/ui/Table';
import { ScreeningBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import type { ScreeningStatus } from '../types/domain';
import { SCREENING_STATUS_LABEL, formatDate, formatDateTime, formatRelative } from '../utils/formatting';

const SCREENING_OUTCOME_LABEL: Partial<Record<ScreeningStatus, string>> = {
  green: 'Likely AP',
  amber: 'At risk',
  red: 'Likely CL',
};

const STATUS_SEGMENTS: Record<string, { color: string; textClass: string; filter: string }> = {
  green: { color: '#15803D', textClass: 'text-success', filter: 'green' },
  amber: { color: '#B45309', textClass: 'text-warning', filter: 'amber' },
  red: { color: '#B91C1C', textClass: 'text-danger', filter: 'red' },
  'not-screened': { color: '#CBD5E1', textClass: 'text-muted', filter: 'not-screened' },
};

export function OverviewPage() {
  const services = useServices();
  const navigate = useNavigate();

  const { data, loading, error, reload } = useAsyncData(() => services.getDashboardSummary(), []);

  const kpiCounts = statusCountsFromDistribution(data?.statusDistribution);
  const totalMetric = data?.metrics.find((metric) => metric.key === 'total');

  const segments: Segment[] =
    data?.statusDistribution.map((entry) => ({
      key: entry.status,
      label: SCREENING_STATUS_LABEL[entry.status],
      detailLabel: SCREENING_OUTCOME_LABEL[entry.status],
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
            <ButtonLink
              to="/screening/new"
              variant="primary"
              icon={<Plus aria-hidden className="size-4" />}
            >
              New screening
            </ButtonLink>
          </>
        }
      />

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : null}

      <OverviewKpiSummary
        totalMetric={totalMetric}
        countsByStatus={kpiCounts}
        loading={loading && !data}
      />

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
            </>
          ) : (
            <LoadingState label="Loading status distribution…" rows={2} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Recent analyses"
          description="Saved assessment results, including the score and confidence."
        />
        {!data ? (
          <LoadingState label="Loading recent analyses…" />
        ) : (data.recentAnalyses ?? []).length === 0 ? (
          <EmptyState
            title="No saved analyses yet"
            message="Run an assessment. The result is stored and listed here."
            variant="shield"
          />
        ) : (
          <TableScroll>
            <Table caption="Recent saved assessments">
              <THead>
                <tr>
                  <Th>Formula</Th>
                  <Th>Score</Th>
                  <Th>Confidence</Th>
                  <Th>Screened</Th>
                  <Th className="text-right">Open</Th>
                </tr>
              </THead>
              <TBody>
                {(data.recentAnalyses ?? []).map((row) => (
                  <Tr key={row.assessmentId} onClick={() => navigate(`/formulas/${row.formulaId}/results/${row.assessmentId}`)}>
                    <Td>
                      <PrimaryCell title={row.formulaName} subtitle={`${row.version || row.formulaId}`} />
                    </Td>
                    <Td className="tabular">
                      {typeof row.score === 'number' ? `${row.score}%` : '—'}
                      {row.bandLabel ? ` ${row.bandLabel}` : ''}
                    </Td>
                    <Td className="capitalize">{row.confidence || '—'}</Td>
                    <Td className="whitespace-nowrap text-muted tabular">{row.createdAt ? formatDateTime(row.createdAt) : '—'}</Td>
                    <Td className="text-right">
                      <Link
                        to={`/formulas/${row.formulaId}/results/${row.assessmentId}`}
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
                  <Th>Submitted</Th>
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
                    <Td className="whitespace-nowrap text-muted tabular">
                      {formatDate(row.submittedAt ?? row.updatedAt)}
                    </Td>
                    <Td>
                      <ScreeningBadge
                        status={row.screeningStatus}
                        current={row.screeningCurrent}
                        showReassessmentBadge={false}
                      />
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
    </div>
  );
}
