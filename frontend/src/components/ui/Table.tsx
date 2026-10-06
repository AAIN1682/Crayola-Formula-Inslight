import type { ReactNode, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { SortDirection } from '../../types/services';
import { useSettings } from '../../state/DemoDataProvider';
import { cn } from '../../utils/cn';

/**
 * Keeps wide tables scrollable inside their own container on narrow screens rather than
 * letting them stretch the page.
 */
export function TableScroll({
  children,
  className,
  minWidth = 'min-w-[760px]',
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className={cn('fi-scroll-x w-full', className)}>
      <div className={minWidth}>{children}</div>
    </div>
  );
}

export function Table({
  children,
  caption,
  className,
}: {
  children: ReactNode;
  caption?: string;
  className?: string;
}) {
  return (
    <table className={cn('w-full border-collapse text-left text-sm', className)}>
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      {children}
    </table>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-line bg-canvas/70">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Th({ children, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2.5 text-[11px] font-semibold tracking-wide text-muted uppercase whitespace-nowrap',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function SortableTh<Key extends string>({
  columnKey,
  activeKey,
  direction,
  onSort,
  children,
  className,
  align = 'left',
}: {
  columnKey: Key;
  activeKey: Key;
  direction: SortDirection;
  onSort: (key: Key) => void;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  const active = activeKey === columnKey;
  return (
    <Th
      className={cn('p-0', className)}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={cn(
          'flex w-full items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase transition-colors hover:text-brand-500',
          align === 'right' && 'justify-end',
          active ? 'text-brand-500' : 'text-muted',
        )}
      >
        {children}
        {active ? (
          direction === 'asc' ? (
            <ArrowUp aria-hidden className="size-3.5" />
          ) : (
            <ArrowDown aria-hidden className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown aria-hidden className="size-3.5 opacity-50" />
        )}
      </button>
    </Th>
  );
}

export function Tr({
  children,
  onClick,
  className,
  selected,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  selected?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'transition-colors',
        onClick && 'cursor-pointer hover:bg-brand-50/60',
        selected && 'bg-info-soft',
        className,
      )}
    >
      {children}
    </tr>
  );
}

/** Row density follows the Settings preference. */
export function useRowPadding(): string {
  const { tableDensity } = useSettings();
  return tableDensity === 'compact' ? 'px-4 py-2' : 'px-4 py-3';
}

export function Td({
  children,
  className,
  colSpan,
  title,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
  title?: string;
}) {
  const padding = useRowPadding();
  return (
    <td className={cn(padding, 'align-middle text-sm text-ink', className)} colSpan={colSpan} title={title}>
      {children}
    </td>
  );
}

export function PrimaryCell({
  title,
  subtitle,
  href,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  href?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-ink">
        {href ? (
          <a className="fi-link font-medium" href={href}>
            {title}
          </a>
        ) : (
          title
        )}
      </div>
      {subtitle ? <div className="truncate text-xs text-muted tabular">{subtitle}</div> : null}
    </div>
  );
}
