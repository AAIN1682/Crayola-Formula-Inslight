import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, BellRing, FlaskConical, Layers, ShieldAlert } from 'lucide-react';
import type { AlertStatus, AlertType } from '../types/domain';
import type { MonitoringFilters } from '../types/services';
import { useAsyncAction, useAsyncData } from '../hooks/useAsyncData';
import { useDemoSelector, useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { MetricCard } from '../components/ui/MetricCard';
import { ActiveFilterChip, FilterBar, MultiSelectFilter, SearchInput } from '../components/ui/Filters';
import { AlertStatusBadge, Badge } from '../components/ui/Badge';
import { PrimaryCell, TBody, Table, TableScroll, Td, Th, THead, Tr } from '../components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Notice } from '../components/ui/DemoNotice';
import { useToast } from '../components/ui/Toast';
import { ReviewTimeline } from '../components/monitoring/ReviewTimeline';
import { AlertDetailDrawer } from '../components/monitoring/AlertDetailDrawer';
import { ALERT_TYPE_LABEL, formatRelative } from '../utils/formatting';

const TYPES: AlertType[] = [
  'safety-source-update',
  'supplier-document-update',
  'evidence-gap',
  'scheduled-review',
];

const STATUSES: AlertStatus[] = ['open', 'acknowledged', 'resolved'];
const SEVERITIES = ['high', 'medium', 'low'] as const;

export function MonitoringPage() {
  const services = useServices();
  const navigate = useNavigate();
  const toast = useToast();
  const { alertId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const people = useDemoSelector((state) => state.people);

  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [severities, setSeverities] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);

  useEffect(() => {
    const status = searchParams.get('status');
    if (status) {
      setStatuses([status]);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filters = useMemo<MonitoringFilters>(
    () => ({
      query,
      types: types as AlertType[],
      statuses: statuses as AlertStatus[],
      severities: severities as ('high' | 'medium' | 'low')[],
      assignedToIds: assignees,
    }),
    [query, types, statuses, severities, assignees],
  );

  const { data, loading, error, reload } = useAsyncData(
    () => services.listMonitoringAlerts(filters),
    [filters],
  );

  const simulate = useAsyncAction(async () => {
    const alert = await services.simulateMonitoringUpdate();
    toast.success(
      'Simulated alert created',
      `${alert.affectedFormulaIds.length} affected ${alert.affectedFormulaIds.length === 1 ? 'formula' : 'formulas'} recalculated.`,
    );
    navigate(`/monitoring/${alert.id}`);
  });

  const activeFilters = [
    ...types.map((value) => ({
      label: `Type: ${ALERT_TYPE_LABEL[value as AlertType]}`,
      clear: () => setTypes((current) => current.filter((item) => item !== value)),
    })),
    ...statuses.map((value) => ({
      label: `Status: ${value}`,
      clear: () => setStatuses((current) => current.filter((item) => item !== value)),
    })),
    ...severities.map((value) => ({
      label: `Severity: ${value}`,
      clear: () => setSeverities((current) => current.filter((item) => item !== value)),
    })),
    ...assignees.map((value) => ({
      label: `Assignee: ${people.find((person) => person.id === value)?.name ?? 'Unassigned'}`,
      clear: () => setAssignees((current) => current.filter((item) => item !== value)),
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring"
        description="Existing formulas affected by simulated updates or approaching their scheduled review date. Everything on this page is generated inside the demo workspace."
        actions={
          <Button
            variant="primary"
            onClick={() => void simulate.run()}
            loading={simulate.pending}
            icon={<FlaskConical aria-hidden className="size-4" />}
          >
            Simulate update
          </Button>
        }
      />

      <Notice tone="neutral" title="No live monitoring is connected">
        This workspace is not subscribed to any regulatory, supplier or safety-source feed. Alerts are
        synthetic records created for the demo, and “Simulate update” adds a clearly labelled one.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Open alerts"
          value={data?.openCount ?? 0}
          caption="Awaiting acknowledgement"
          to="/monitoring?status=open"
          icon={<BellRing aria-hidden className="size-4" />}
          tone={data && data.openCount > 0 ? 'warning' : 'neutral'}
        />
        <MetricCard
          label="Acknowledged"
          value={data?.acknowledgedCount ?? 0}
          caption="In progress"
          to="/monitoring"
          icon={<ShieldAlert aria-hidden className="size-4" />}
        />
        <MetricCard
          label="Affected formulas"
          value={data?.affectedFormulaCount ?? 0}
          caption="Matched by an open alert"
          to="/formulas"
          icon={<Layers aria-hidden className="size-4" />}
        />
        <MetricCard
          label="Upcoming reviews"
          value={data?.upcomingReviews.length ?? 0}
          caption="Scheduled within 120 days"
          to="/formulas"
          icon={<ArrowRight aria-hidden className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Alerts" description="Filter by type, status, severity or assignee." />
          <FilterBar className="border-t-0">
            <SearchInput
              value={query}
              onChange={setQuery}
              label="Search alerts"
              placeholder="Search alerts…"
              className="w-full sm:w-64"
            />
            <MultiSelectFilter
              label="Type"
              options={TYPES.map((type) => ({ value: type, label: ALERT_TYPE_LABEL[type] }))}
              selected={types}
              onChange={setTypes}
              width="w-52"
            />
            <MultiSelectFilter
              label="Status"
              options={STATUSES.map((status) => ({ value: status, label: status }))}
              selected={statuses}
              onChange={setStatuses}
              width="w-40"
            />
            <MultiSelectFilter
              label="Severity"
              options={SEVERITIES.map((severity) => ({ value: severity, label: severity }))}
              selected={severities}
              onChange={setSeverities}
              width="w-40"
            />
            <MultiSelectFilter
              label="Assignee"
              options={[
                { value: 'unassigned', label: 'Unassigned' },
                ...people.map((person) => ({ value: person.id, label: person.name })),
              ]}
              selected={assignees}
              onChange={setAssignees}
              width="w-44"
            />
          </FilterBar>

          {activeFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
              <span className="text-xs text-muted">Active filters:</span>
              {activeFilters.map((filter) => (
                <ActiveFilterChip key={filter.label} label={filter.label} onRemove={filter.clear} />
              ))}
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setTypes([]);
                  setStatuses([]);
                  setSeverities([]);
                  setAssignees([]);
                }}
                className="ml-1 text-xs font-medium text-brand-500 hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : null}

          {error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading && !data ? (
            <LoadingState label="Loading alerts…" rows={5} />
          ) : !data || data.alerts.length === 0 ? (
            <EmptyState
              variant="shield"
              title="No alerts match these filters"
              message="Clear the filters, or use “Simulate update” to create a labelled demo alert."
            />
          ) : (
            <TableScroll>
              <Table caption="Monitoring alerts">
                <THead>
                  <tr>
                    <Th>Alert</Th>
                    <Th>Type</Th>
                    <Th>Severity</Th>
                    <Th className="text-right">Affected</Th>
                    <Th>Assignee</Th>
                    <Th>Status</Th>
                    <Th>Raised</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.alerts.map((alert) => (
                    <Tr key={alert.id} onClick={() => navigate(`/monitoring/${alert.id}`)}>
                      <Td className="max-w-[320px]">
                        <PrimaryCell
                          title={
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="line-clamp-2">{alert.title}</span>
                              {alert.simulated ? <Badge tone="accent">Simulated</Badge> : null}
                            </span>
                          }
                          subtitle={alert.id}
                        />
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{ALERT_TYPE_LABEL[alert.type]}</Td>
                      <Td>
                        <Badge
                          tone={
                            alert.severity === 'high'
                              ? 'danger'
                              : alert.severity === 'medium'
                                ? 'warning'
                                : 'info'
                          }
                        >
                          {alert.severity}
                        </Badge>
                      </Td>
                      <Td className="text-right tabular">{alert.affectedFormulaIds.length}</Td>
                      <Td className="whitespace-nowrap text-muted">
                        {alert.assignedToId
                          ? (people.find((person) => person.id === alert.assignedToId)?.name ?? 'Unassigned')
                          : 'Unassigned'}
                      </Td>
                      <Td>
                        <AlertStatusBadge status={alert.status} />
                      </Td>
                      <Td className="whitespace-nowrap text-muted tabular">
                        {formatRelative(alert.createdAt)}
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
            title="Upcoming reviews"
            description="Formulas approaching their recorded review date."
          />
          {data ? <ReviewTimeline reviews={data.upcomingReviews} /> : <LoadingState rows={3} />}
        </Card>
      </div>

      <p className="text-xs text-muted">
        Alerts link to the affected formulas. Open one to see what changed, why it matched and which review
        action is suggested, or go straight to the{' '}
        <Link to="/formulas" className="fi-link">
          Formula Library
        </Link>
        .
      </p>

      {alertId ? <AlertDetailDrawer alertId={alertId} onClose={() => navigate('/monitoring')} /> : null}
    </div>
  );
}
