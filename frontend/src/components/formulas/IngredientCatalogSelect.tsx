import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  findIngredientCatalogEntryById,
  formatIngredientCatalogLabel,
  quickPickIngredientCatalog,
  searchIngredientCatalog,
  type IngredientCatalogEntry,
} from '../../data/ingredientCatalog';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';

const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M4 6.5 8 10.5 12 6.5'/%3E%3C/svg%3E\")";

export function IngredientCatalogSelect({
  catalog,
  catalogIngredientId,
  fallbackName,
  catalogLoading,
  onSelect,
  invalid,
  disabled,
}: {
  catalog: IngredientCatalogEntry[];
  catalogIngredientId: string;
  /** Shown when a saved row has a name but no catalog id yet (legacy/demo rows). */
  fallbackName?: string;
  catalogLoading?: boolean;
  onSelect: (entry: IngredientCatalogEntry) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [results, setResults] = useState<IngredientCatalogEntry[]>(() => quickPickIngredientCatalog(catalog));

  const selected = findIngredientCatalogEntryById(catalog, catalogIngredientId);
  const displayLabel = selected
    ? formatIngredientCatalogLabel(selected)
    : fallbackName?.trim() || '';

  useEffect(() => {
    setResults(quickPickIngredientCatalog(catalog));
  }, [catalog]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const openPanel = () => {
    if (disabled || catalog.length === 0) return;
    setOpen(true);
    setSearchDraft('');
    setResults(quickPickIngredientCatalog(catalog));
  };

  const runSearch = () => {
    setResults(searchIngredientCatalog(catalog, searchDraft));
    setOpen(true);
  };

  const pick = (entry: IngredientCatalogEntry) => {
    onSelect(entry);
    setOpen(false);
    setSearchDraft('');
    setResults(quickPickIngredientCatalog(catalog));
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled || catalog.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={cn(
          'flex h-9.5 w-full cursor-pointer items-center rounded-lg border border-line bg-surface px-3 pr-9 text-left text-sm transition-colors',
          'bg-[length:16px] bg-[right_10px_center] bg-no-repeat',
          'focus:border-brand-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-400',
          'disabled:cursor-not-allowed disabled:bg-neutral-soft disabled:text-muted',
          invalid && 'border-danger-line bg-danger-soft/40',
          !displayLabel && 'text-subtle',
        )}
        style={{ backgroundImage: SELECT_CHEVRON }}
      >
        <span className="truncate">
          {displayLabel ||
            (catalogLoading ? 'Loading catalog…' : catalog.length === 0 ? 'Catalog unavailable' : 'Select ingredient')}
        </span>
      </button>

      {open ? (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[min(100%,22rem)] overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
          <div className="flex gap-2 border-b border-line p-2">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle"
              />
              <input
                type="search"
                value={searchDraft}
                placeholder="Search ingredients…"
                aria-label="Search ingredients"
                className="h-9 w-full rounded-lg border border-line bg-canvas pr-2 pl-8 text-sm text-ink placeholder:text-subtle focus:border-brand-400 focus:bg-surface focus:outline-none"
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    runSearch();
                  }
                  if (event.key === 'Escape') setOpen(false);
                }}
              />
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={runSearch}>
              Search
            </Button>
          </div>

          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-muted">No ingredients match that search.</li>
            ) : (
              results.map((entry) => (
                <li key={entry.id} role="option" aria-selected={selected?.id === entry.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full truncate px-3 py-2 text-left text-sm transition-colors hover:bg-info-soft',
                      selected?.id === entry.id && 'bg-info-soft font-medium text-ink',
                    )}
                    onClick={() => pick(entry)}
                  >
                    {formatIngredientCatalogLabel(entry)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
