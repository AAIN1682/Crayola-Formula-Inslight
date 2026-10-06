import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';
import { cn } from '../../utils/cn';

export function MetricCard({
  label,
  value,
  caption,
  to,
  icon,
  trend,
  trendLabel,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  caption?: string;
  to: string;
  icon?: ReactNode;
  trend?: number[];
  trendLabel?: string;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col justify-between rounded-card border bg-surface p-4 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised',
        tone === 'warning' ? 'border-warning-line/70' : tone === 'danger' ? 'border-danger-line/70' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon ? (
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-lg',
                tone === 'warning'
                  ? 'bg-warning-soft text-warning'
                  : tone === 'danger'
                    ? 'bg-danger-soft text-danger'
                    : 'bg-info-soft text-brand-500',
              )}
            >
              {icon}
            </span>
          ) : null}
          <span className="text-[13px] font-medium text-muted">{label}</span>
        </div>
        <ArrowUpRight
          aria-hidden
          className="size-4 text-subtle transition-colors group-hover:text-brand-500"
        />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[30px] leading-9 font-semibold tracking-tight text-navy-800 tabular">
            {value}
          </p>
          {caption ? <p className="mt-0.5 text-xs text-muted">{caption}</p> : null}
        </div>
        {trend && trend.length > 1 ? (
          <Sparkline
            values={trend}
            label={trendLabel ?? `${label} over the last ${trend.length} months`}
            tone={tone === 'warning' ? 'warning' : 'brand'}
          />
        ) : null}
      </div>
    </Link>
  );
}
