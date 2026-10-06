import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Open dialogs, outermost first. Only the topmost dialog reacts to Escape and Tab, so a
 * drawer opened on top of another drawer behaves correctly.
 */
const dialogStack: symbol[] = [];

/**
 * Shared dialog behaviour: initial focus, a focus trap, Escape-to-close, background
 * scroll locking and focus restoration when the dialog unmounts.
 */
export function useDialogBehavior(
  open: boolean,
  onClose: () => void,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const token = Symbol('dialog');
    dialogStack.push(token);
    const isTopmost = () => dialogStack[dialogStack.length - 1] === token;

    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () => {
      const container = containerRef.current;
      if (!container) return [] as HTMLElement[];
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
    };

    const focusTimer = window.setTimeout(() => {
      const [first] = focusables();
      (first ?? containerRef.current)?.focus();
    }, 30);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusables();
      if (elements.length === 0) {
        event.preventDefault();
        containerRef.current?.focus();
        return;
      }
      const first = elements[0] as HTMLElement;
      const last = elements[elements.length - 1] as HTMLElement;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === containerRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const index = dialogStack.indexOf(token);
      if (index !== -1) dialogStack.splice(index, 1);
      restoreRef.current?.focus();
    };
  }, [open]);

  return containerRef;
}
