import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Ingredient } from '../../types/domain';
import { formatConcentration } from '../../utils/formatting';

const PALETTE = ['#1B5E8C', '#2E86C1', '#0D9488', '#5B8FB9', '#14B8A6', '#93C0DD', '#17507A', '#64748B'];

interface Row {
  name: string;
  shortName: string;
  value: number;
  color: string;
  incomplete: boolean;
}

/**
 * Compact composition graphic. Ingredients below 1% are grouped into a single row so the
 * chart stays readable; the legend repeats every value as text.
 */
export function CompositionChart({ ingredients }: { ingredients: Ingredient[] }) {
  const sorted = [...ingredients].sort((a, b) => b.concentration - a.concentration);
  const major = sorted.filter((ingredient) => ingredient.concentration >= 1);
  const minor = sorted.filter((ingredient) => ingredient.concentration < 1);
  const minorTotal = Math.round(minor.reduce((sum, item) => sum + item.concentration, 0) * 1000) / 1000;

  const rows: Row[] = major.map((ingredient, index) => ({
    name: ingredient.name,
    shortName: ingredient.name.length > 26 ? `${ingredient.name.slice(0, 24)}…` : ingredient.name,
    value: ingredient.concentration,
    color: PALETTE[index % PALETTE.length] as string,
    incomplete: !ingredient.rawMaterialId,
  }));

  if (minor.length > 0) {
    rows.push({
      name: `${minor.length} ingredient${minor.length === 1 ? '' : 's'} below 1%`,
      shortName: `${minor.length} below 1%`,
      value: minorTotal,
      color: '#CBD5E1',
      incomplete: minor.some((ingredient) => !ingredient.rawMaterialId),
    });
  }

  const summary = `Composition by concentration: ${rows
    .map((row) => `${row.name} ${formatConcentration(row.value)}`)
    .join(', ')}.`;

  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted">No ingredients recorded yet.</p>;
  }

  return (
    <figure className="m-0 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="h-56 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
            barCategoryGap="22%"
          >
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="shortName"
              width={128}
              tick={{ fill: '#64748B', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(46,134,193,0.06)' }}
              formatter={(value) => [formatConcentration(Number(value)), 'Concentration']}
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
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="min-w-0">
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-subtle uppercase">Legend</p>
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.name} className="flex items-start gap-2 text-xs">
              <span
                className="mt-1 size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-ink">
                <span className="block truncate" title={row.name}>
                  {row.name}
                </span>
                <span className="text-muted tabular">{formatConcentration(row.value)}</span>
                {row.incomplete ? (
                  <span className="ml-1.5 text-warning">· incomplete record</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
