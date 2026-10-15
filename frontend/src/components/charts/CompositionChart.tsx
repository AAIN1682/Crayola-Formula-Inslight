import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Ingredient } from '../../types/domain';
import { formatConcentration } from '../../utils/formatting';

const PALETTE = ['#1B5E8C', '#2E86C1', '#0D9488', '#5B8FB9', '#14B8A6', '#93C0DD', '#17507A', '#64748B'];
const ROW_HEIGHT = 34;

interface Row {
  name: string;
  shortName: string;
  value: number;
  color: string;
}

/** Compact composition graphic: one named bar per ingredient, each labelled with its value. */
export function CompositionChart({ ingredients }: { ingredients: Ingredient[] }) {
  const sorted = [...ingredients].sort((a, b) => b.concentration - a.concentration);

  const rows: Row[] = sorted.map((ingredient, index) => ({
    name: ingredient.name,
    shortName: ingredient.name.length > 22 ? `${ingredient.name.slice(0, 20)}…` : ingredient.name,
    value: ingredient.concentration,
    color: PALETTE[index % PALETTE.length] as string,
  }));

  const summary = `Composition by concentration: ${rows
    .map((row) => `${row.name} ${formatConcentration(row.value)}`)
    .join(', ')}.`;

  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted">No ingredients recorded yet.</p>;
  }

  return (
    <div className="w-full min-w-0" style={{ height: rows.length * ROW_HEIGHT + 8 }} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 44, left: 0, bottom: 4 }}
          barCategoryGap="24%"
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="shortName"
            width={120}
            tick={{ fill: '#64748B', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(46,134,193,0.06)' }}
            formatter={(value) => [formatConcentration(Number(value)), '% W/W']}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              boxShadow: '0 4px 12px rgba(16,42,67,0.08)',
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {rows.map((row) => (
              <Cell key={row.name} fill={row.color} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(value: unknown) => formatConcentration(Number(value))}
              style={{ fill: '#334155', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
