import { Link } from 'react-router-dom';
import type { ScreeningStatus } from '../../types/domain';
import type { DashboardMetric } from '../../types/services';

const KPI_ITEMS: {
  status: ScreeningStatus;
  label: string;
  caption: string;
  dotClass: string;
}[] = [
  {
    status: 'green',
    label: 'Likely AP',
    caption: 'ready, or one small fix away',
    dotClass: 'bg-success',
  },
  {
    status: 'amber',
    label: 'At risk',
    caption: 'likely to need another review round',
    dotClass: 'bg-warning',
  },
  {
    status: 'red',
    label: 'Likely CL',
    caption: 'would need warning labels as is',
    dotClass: 'bg-danger',
  },
  {
    status: 'not-screened',
    label: 'Not screened',
    caption: 'formulas not assessed yet',
    dotClass: 'bg-[#CBD5E1]',
  },
];

function KpiCell({
  to,
  label,
  value,
  caption,
  dotClass,
  loading,
}: {
  to: string;
  label: string;
  value: number;
  caption: string;
  dotClass: string;
  loading?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 flex-col gap-2 px-3 py-5 transition-colors hover:bg-canvas sm:px-4 sm:py-6 lg:px-5"
    >
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
        <span className="text-[13px] font-medium text-ink">{label}</span>
      </div>
      {loading ? (
        <div className="h-9 w-12 animate-pulse rounded bg-line/60" aria-hidden />
      ) : (
        <p className="text-[32px] leading-none font-semibold tracking-tight text-navy-800 tabular">{value}</p>
      )}
      <p className="text-[13px] leading-5 text-muted">{caption}</p>
    </Link>
  );
}

export function OverviewKpiSummary({
  totalMetric,
  countsByStatus,
  loading,
}: {
  totalMetric?: DashboardMetric;
  countsByStatus: Partial<Record<ScreeningStatus, number>>;
  loading?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="grid w-full grid-cols-5 divide-x divide-line max-md:overflow-x-auto max-md:min-w-[52rem]">
          <KpiCell
            to={totalMetric?.to ?? '/formulas'}
            label={totalMetric?.label ?? 'Total formulas'}
            value={totalMetric?.value ?? 0}
            caption="across all assessments"
            // caption={totalMetric?.caption ?? 'Active formulas in the library'}
            dotClass="bg-brand-500"
            loading={loading}
          />
          {KPI_ITEMS.map((item) => (
            <KpiCell
              key={item.status}
              to={`/formulas?screening=${item.status}`}
              label={item.label}
              value={countsByStatus[item.status] ?? 0}
              caption={item.caption}
              dotClass={item.dotClass}
              loading={loading}
            />
          ))}
      </div>
    </div>
  );
}

export function statusCountsFromDistribution(
  distribution: { status: ScreeningStatus; count: number }[] | undefined,
): Partial<Record<ScreeningStatus, number>> {
  const counts: Partial<Record<ScreeningStatus, number>> = {};
  for (const entry of distribution ?? []) {
    counts[entry.status] = entry.count;
  }
  return counts;
}
