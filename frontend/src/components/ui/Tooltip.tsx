import { useId, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Small explanatory tooltip. It opens on hover and on keyboard focus, and the content is
 * also exposed to assistive technology through `aria-describedby`.
 */
export function InfoTooltip({
  label,
  children,
  align = 'left',
  className,
}: {
  label: string;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-4.5 items-center justify-center rounded-full text-subtle transition-colors hover:bg-neutral-soft hover:text-brand-500"
      >
        <Info aria-hidden className="size-3.5" />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'fi-animate-in absolute bottom-full z-30 mb-2 w-64 rounded-lg border border-line bg-surface p-3 text-xs leading-5 font-normal text-ink shadow-raised',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
