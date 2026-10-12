import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CatalogOption } from '../../hooks/useCatalogMaterials';

const CUSTOM = '__custom__';

export function IngredientPicker({
  options,
  catalogId,
  custom,
  customName,
  loading,
  onSelectCatalog,
  onCustomName,
}: {
  options: CatalogOption[];
  catalogId?: string;
  custom: boolean;
  customName: string;
  loading?: boolean;
  onSelectCatalog: (id: string) => void;
  onCustomName: (name: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const enriched = useMemo(
    () => [...options, { id: CUSTOM, name: 'Custom ingredient…', cas: '-', functionLabel: '-' }],
    [options],
  );

  const selectedLabel = useMemo(() => {
    if (custom) return customName;
    const hit = enriched.find((o) => o.id === catalogId);
    return hit?.name ?? '';
  }, [catalogId, custom, customName, enriched]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (custom) {
    return (
      <input
        className="ps-in"
        value={customName}
        placeholder="Custom ingredient name"
        title="Not in catalog"
        aria-label="Custom ingredient name"
        onChange={(event) => onCustomName(event.target.value)}
      />
    );
  }

  if (options.length <= 50) {
    return (
      <select
        className="ps-in"
        value={catalogId ?? ''}
        disabled={loading}
        aria-label="Ingredient"
        onChange={(event) => onSelectCatalog(event.target.value)}
      >
        <option value="">{loading ? 'Loading catalog…' : 'Select ingredient…'}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
        <option value={CUSTOM}>Custom ingredient…</option>
      </select>
    );
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? enriched.filter(
        (o) => o.name.toLowerCase().includes(needle) || o.id.toLowerCase().includes(needle),
      )
    : enriched;

  return (
    <div className="ps-combobox" ref={rootRef}>
      <input
        className="ps-in"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Ingredient"
        placeholder={loading ? 'Loading catalog…' : 'Search ingredients…'}
        value={open ? query : selectedLabel}
        disabled={loading}
        onFocus={() => {
          setOpen(true);
          setQuery(selectedLabel);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && filtered[0]) {
            onSelectCatalog(filtered[0].id);
            setOpen(false);
            setQuery('');
          }
        }}
      />
      {open && filtered.length > 0 ? (
        <ul className="ps-combobox-list" id={listId} role="listbox">
          {filtered.slice(0, 40).map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelectCatalog(option.id);
                  setOpen(false);
                  setQuery('');
                }}
              >
                {option.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
