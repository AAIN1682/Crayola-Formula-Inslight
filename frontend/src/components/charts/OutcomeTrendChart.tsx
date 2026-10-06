import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OutcomeTrendPoint } from '../../types/services';

const SERIES = [
  { key: 'AP', label: 'AP', color: '#15803D' },
  { key: 'CL', label: 'CL', color: '#2E86C1' },
  { key: 'More Data Needed', label: 'More Data Needed', color: '#B45309' },
] as const;

export function OutcomeTrendChart({ points }: { points: OutcomeTrendPoint[] }) {
  const totals = points.reduce(
    (acc, point) => ({
      AP: acc.AP + point.AP,
      CL: acc.CL + point.CL,
      more: acc.more + point['More Data Needed'],
    }),
    { AP: 0, CL: 0, more: 0 },
  );

  const summary = `Across ${points.length} quarters of synthetic submission history: ${totals.AP} recorded AP, ${totals.CL} recorded CL and ${totals.more} recorded More Data Needed.`;

  if (points.length === 0) {
    return <p className="px-5 py-8 text-center text-[13px] text-muted">No historical submissions recorded.</p>;
  }

  return (
    <figure className="m-0">
      <div className="h-56 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fill: '#64748B', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#E2E8F0' }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#64748B', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(46,134,193,0.06)' }}
              contentStyle={{
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 12px rgba(16,42,67,0.08)',
                fontSize: 12,
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={28}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, color: '#64748B' }}
            />
            {SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                stackId="outcomes"
                fill={series.color}
                radius={series.key === 'More Data Needed' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={38}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs leading-5 text-muted">
        {summary} Recorded outcomes describe the historical demo submissions only and do not predict the
        result of a new or modified formula.
      </figcaption>
    </figure>
  );
}
