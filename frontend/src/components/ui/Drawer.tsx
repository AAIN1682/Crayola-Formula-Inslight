import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { useDialogBehavior } from './dialogBehavior';
import { cn } from '../../utils/cn';

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}) {
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useDialogBehavior(open, onClose);

  if (!open) return null;

  const widthClass =
    width === 'xl' ? 'max-w-[1040px]' : width === 'lg' ? 'max-w-[760px]' : 'max-w-[560px]';

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fi-animate-in absolute inset-0 bg-navy-900/35"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'fi-slide-in-right relative flex h-full w-full flex-col bg-surface shadow-overlay',
          widthClass,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-semibold tracking-wide text-brand-400 uppercase">
                {eyebrow}
              </p>
            ) : null}
            <h2 id={titleId} className="truncate text-lg leading-7 font-semibold text-navy-800">
              {title}
            </h2>
            {subtitle ? (
              <p id={descriptionId} className="mt-0.5 text-[13px] text-muted">
                {subtitle}
              </p>
            ) : null}
          </div>
          <IconButton label="Close panel" onClick={onClose}>
            <X aria-hidden className="size-4.5" />
          </IconButton>
        </header>

        <div className="fi-scroll-y flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/70 px-6 py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
