import { memo } from 'react';
import type { CatalogOption } from '../../hooks/useCatalogMaterials';

export const CUSTOM_INGREDIENT_VALUE = '__custom__';

export const IngredientSelect = memo(function IngredientSelect({
  selectId,
  rowIndex,
  options,
  contaminantOptions = [],
  catalogId,
  custom,
  customName,
  loading,
  onSelectCatalog,
  onCustomName,
  onBackToList,
}: {
  selectId: string;
  rowIndex: number;
  options: CatalogOption[];
  contaminantOptions?: CatalogOption[];
  catalogId?: string;
  custom: boolean;
  customName: string;
  loading?: boolean;
  onSelectCatalog: (id: string) => void;
  onCustomName: (name: string) => void;
  onBackToList: () => void;
}) {
  if (custom) {
    return (
      <div className="ps-ingredient-custom">
        <input
          className="ps-in"
          value={customName}
          placeholder="Custom ingredient name"
          aria-label="Custom ingredient name"
          onChange={(event) => onCustomName(event.target.value)}
        />
        <button type="button" className="ps-back-to-list" onClick={onBackToList}>
          Back to list
        </button>
      </div>
    );
  }

  const value = catalogId ?? '';

  return (
    <>
      <label className="sr-only" htmlFor={selectId}>
        Ingredient {rowIndex + 1}
      </label>
      <select
        id={selectId}
        className="ps-in"
        data-row={rowIndex}
        data-field="id"
        disabled={loading}
        value={value}
        aria-label="Ingredient"
        onChange={(event) => {
          const next = event.target.value;
          if (!next) return;
          onSelectCatalog(next);
        }}
      >
        <option value="" disabled>
          Select ingredient…
        </option>
        <optgroup label="Formulation ingredients">
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </optgroup>
        {contaminantOptions.length ? (
          <optgroup label="Lab analytes / contaminants">
            {contaminantOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        <option value={CUSTOM_INGREDIENT_VALUE}>Use custom ingredient…</option>
      </select>
    </>
  );
});
