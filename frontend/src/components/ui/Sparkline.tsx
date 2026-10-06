import { cn } from '../../utils/cn';

/**
 * Minimal inline trend line. Rendered as plain SVG so it stays legible at small sizes
 * and never competes with the real charts.
 */
export function Sparkline({
  values,
  className,
  label,
  tone = 'brand',
}: {
  values: number[];
  className?: string;
  label: string;
  tone?: 'brand' | 'warning';
}) {
  if (values.length < 2) return null;

  const width = 72;
  const height = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });

  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${path} L${width} ${height} L0 ${height} Z`;
  const last = points[points.length - 1] as readonly [number, number];
  const stroke = tone === 'warning' ? 'var(--color-warning)' : 'var(--color-brand-400)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('h-6 w-18 overflow-visible', className)}
      role="img"
      aria-label={label}
    >
      <path d={area} fill={stroke} opacity="0.1" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={stroke} />
    </svg>
  );
}
