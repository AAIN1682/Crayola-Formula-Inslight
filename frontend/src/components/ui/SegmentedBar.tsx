import { cn } from '../../utils/cn';

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  textClass: string;
}

/**
 * Segmented status bar. Each segment is paired with a legend entry that repeats the
 * label and count, so the information never depends on colour alone.
 */
export function SegmentedBar({
  segments,
  total,
  className,
  onSegmentClick,
  summary,
}: {
  segments: Segment[];
  total: number;
  className?: string;
  onSegmentClick?: (key: string) => void;
  summary?: string;
}) {
  const safeTotal = total || 1;
  const visible = segments.filter((segment) => segment.value > 0);

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-soft"
        role="img"
        aria-label={
          summary ??
          `Screening status split: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`
        }
      >
        {visible.map((segment) => (
          <span
            key={segment.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(segment.value / safeTotal) * 100}%`, backgroundColor: segment.color }}
          />
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {segments.map((segment) => {
          const content = (
            <>
              <span
                className="mt-1.5 size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: segment.color }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-medium text-muted">{segment.label}</span>
                <span className={cn('block text-base leading-6 font-semibold tabular', segment.textClass)}>
                  {segment.value}
                </span>
              </span>
            </>
          );

          return (
            <li key={segment.key}>
              {onSegmentClick ? (
                <button
                  type="button"
                  onClick={() => onSegmentClick(segment.key)}
                  className="-m-1 flex w-full items-start gap-2 rounded-md p-1 text-left transition-colors hover:bg-neutral-soft"
                >
                  {content}
                </button>
              ) : (
                <span className="flex items-start gap-2">{content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
