import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { PRODUCT_CATEGORIES, TARGET_MARKETS } from '../types/domain';
import {
  AGE_GRADE_OPTIONS,
  DRAFT_STORAGE_KEY,
  defaultDraft,
  emptyCompositionRow,
  type CompositionRow,
  type NewScreeningDraft,
} from '../types/newScreening';
import { CompositionTotalMeter } from '../components/new-screening/CompositionTotalMeter';
import { IngredientSelect } from '../components/new-screening/IngredientSelect';
import { useCatalogMaterials } from '../hooks/useCatalogMaterials';
import { rebalancePercentages } from '../utils/compositionMath';
import { casValidationMessage } from '../utils/casValidation';
import { SupportingFilesSection } from '../components/new-screening/SupportingFilesSection';
import { ScreeningProgressOverlay } from '../components/new-screening/ScreeningProgressOverlay';
import { StartFromSelect } from '../components/new-screening/StartFromSelect';
import { draftToFormulaInput, formulaToDraft, mergeIngredientDocumentIds } from '../utils/newScreeningSave';
import { productColorHex } from '../utils/productColor';
import { runPrecheckBlockers } from '../utils/newScreeningValidation';
import { createStoredFormula, fetchFormula, updateStoredFormula } from '../api/formulaBackend';
import { useToast } from '../components/ui/Toast';
import { useServices } from '../state/DemoDataProvider';
import '../styles/preseal-new-screening.css';

function loadLocalDraft(): NewScreeningDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NewScreeningDraft;
  } catch {
    return null;
  }
}

function rowErrors(row: CompositionRow, rows: CompositionRow[]): { pct?: string; cas?: string; duplicate?: string } {
  const errors: { pct?: string; cas?: string; duplicate?: string } = {};
  const pct = Number.parseFloat(row.pct);
  if (row.pct.trim() && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
    errors.pct = 'Enter a number from 0 to 100.';
  }
  if (row.custom && row.cas.trim()) {
    const casError = casValidationMessage(row.cas);
    if (casError) errors.cas = casError;
  }
  const key = row.catalogId || row.name.trim().toLowerCase();
  if (key) {
    const dupes = rows.filter((other) => other.key !== row.key && (other.catalogId || other.name.trim().toLowerCase()) === key);
    if (dupes.length) errors.duplicate = 'This ingredient is already in the table.';
  }
  return errors;
}

export function NewScreeningPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const params = useParams();
  const editId = params.formulaId;
  const services = useServices();

  const [draft, setDraft] = useState<NewScreeningDraft>(() => loadLocalDraft() ?? defaultDraft());
  const [dirty, setDirty] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [runError, setRunError] = useState<string>();
  const [overlayOpen, setOverlayOpen] = useState(false);

  const catalog = useCatalogMaterials(draft.category, draft.ageGroup, draft.targetMarkets);
  const ingredientOptions = catalog.formulationOptions;
  const contaminantOptions = catalog.contaminantOptions;

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchFormula(editId).then((formula) => {
      if (cancelled) return;
      setDraft(formulaToDraft(formula));
      setDirty(false);
    });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  useEffect(() => {
    if (dirty) localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft, dirty]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const blocker = useBlocker(dirty && !running);

  const title = draft.name.trim() || 'Untitled formula';
  const runBlockers = useMemo(() => runPrecheckBlockers(draft), [draft]);
  const runPrecheckHint = runBlockers.length ? runBlockers.join(' ') : undefined;
  const canRun = runBlockers.length === 0 && !saving && !running;

  const patch = useCallback((update: Partial<NewScreeningDraft>) => {
    setRunError(undefined);
    setDraft((current) => ({ ...current, ...update }));
    setDirty(true);
  }, []);

  const patchRow = (key: string, update: Partial<CompositionRow>) => {
    setRunError(undefined);
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((row) => {
        if (row.key !== key) return row;
        const merged = { ...row, ...update };
        if (update.documentIds) {
          merged.documentIds = mergeIngredientDocumentIds(row.documentIds, update.documentIds);
        }
        return merged;
      }),
    }));
    setDirty(true);
  };

  const selectIngredient = (key: string, value: string) => {
    if (value === '__custom__') {
      patchRow(key, {
        custom: true,
        catalogId: undefined,
        name: '',
        cas: '',
        functionLabel: '-',
        inRuleCatalog: undefined,
        screeningRole: undefined,
      });
      return;
    }
    const option = catalog.options.find((item) => item.id === value);
    if (!option) return;
    patchRow(key, {
      custom: false,
      catalogId: option.id,
      name: option.name,
      cas: option.cas || '-',
      functionLabel: option.functionLabel || '-',
      inRuleCatalog: option.inRuleCatalog,
      screeningRole:
        option.screeningRole === 'contaminant_analyte'
          ? 'contaminant_analyte'
          : 'formulation_ingredient',
    });
  };

  const swatchColor = productColorHex(draft.productColor);

  const toggleMarket = (code: (typeof TARGET_MARKETS)[number]['code'], checked: boolean) => {
    const set = new Set(draft.targetMarkets);
    if (checked) set.add(code);
    else set.delete(code);
    patch({ targetMarkets: [...set] as NewScreeningDraft['targetMarkets'] });
  };

  const saveDraft = async (): Promise<string | undefined> => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const input = draftToFormulaInput(draft, 'draft');
      const saved = draft.formulaId
        ? await updateStoredFormula(draft.formulaId, input)
        : await createStoredFormula(input);
      setDraft((current) => {
        const next = { ...current, formulaId: saved.id, productColor: productColorHex(current.productColor) };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      setDirty(false);
      toast.success('Draft saved', `${saved.name} was saved without screening.`);
      return saved.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The formula could not be saved.';
      setSaveError(message);
      toast.error('Save failed', message);
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  const runPrecheck = async () => {
    setSubmitAttempted(true);
    setRunError(undefined);
    if (!canRun) {
      setRunError(runBlockers.join(' '));
      return;
    }
    setRunning(true);
    setOverlayOpen(true);
    try {
      const input = draftToFormulaInput(draft, 'active');
      const saved = draft.formulaId
        ? await updateStoredFormula(draft.formulaId, input)
        : await createStoredFormula(input);
      const run = await services.runScreening(saved.id);
      const runId = run.id;
      setDirty(false);
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setOverlayOpen(false);
      navigate(`/formulas/${saved.id}/results/${runId}`, { replace: true });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'The pre-check could not be completed.');
      setOverlayOpen(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="ps-screening">
      <header className="ps-page-head">
        <div className="min-w-0">
          <p className="ps-eyebrow">New screening</p>
          <h1 className="ps-title">
            <span className="ps-sw" style={{ backgroundColor: swatchColor }} aria-hidden />
            <span>{title}</span>
          </h1>
          <p className="ps-lede">
            Enter the same details as the ACMI submission template. PreSeal checks them before anything goes to the
            toxicologist.
          </p>
        </div>
        <StartFromSelect
          current={draft}
          dirty={dirty}
          onApply={(next) => {
            setDraft(next);
            setDirty(true);
          }}
        />
      </header>

      {blocker.state === 'blocked' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          You have unsaved changes.{' '}
          <button type="button" className="font-medium text-[var(--ps-accent)] underline" onClick={() => blocker.proceed?.()}>
            Leave anyway
          </button>{' '}
          or{' '}
          <button type="button" className="font-medium text-[var(--ps-accent)] underline" onClick={() => blocker.reset?.()}>
            stay on this page
          </button>
          .
        </div>
      ) : null}

      {saveError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <span>{saveError}</span>
          <button type="button" className="ps-btn" onClick={() => void saveDraft()}>
            Retry
          </button>
        </div>
      ) : null}

      {runError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <span>{runError}</span>
          <button type="button" className="ps-btn" onClick={() => void runPrecheck()}>
            Retry
          </button>
        </div>
      ) : null}

      <section className="ps-panel" aria-labelledby="ps-product-heading">
        <div className="ps-panel-head">
          <h2 id="ps-product-heading">
            <span className="ps-sn">1</span>
            Product
          </h2>
        </div>
        <div className="ps-form-grid">
          <div className="ps-field">
            <label htmlFor="ps-product-name">Product name</label>
            <input
              id="ps-product-name"
              className="ps-in"
              value={draft.name}
              autoComplete="off"
              aria-invalid={submitAttempted && !draft.name.trim()}
              onChange={(event) => patch({ name: event.target.value })}
            />
            {submitAttempted && !draft.name.trim() ? (
              <span className="text-xs text-red-600">Required.</span>
            ) : null}
          </div>
          <div className="ps-field">
            <label htmlFor="ps-formula-code">Formula code</label>
            <input
              id="ps-formula-code"
              className="ps-in mono"
              value={draft.formulaCode}
              onChange={(event) => patch({ formulaCode: event.target.value })}
            />
          </div>
          <div className="ps-field">
            <label htmlFor="ps-category">Category</label>
            <select
              id="ps-category"
              className="ps-in"
              value={draft.category}
              onChange={(event) => patch({ category: event.target.value as NewScreeningDraft['category'] })}
            >
              {PRODUCT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="ps-field">
            <label htmlFor="ps-physical-form">Physical form</label>
            <input
              id="ps-physical-form"
              className="ps-in"
              value={draft.physicalForm}
              onChange={(event) => patch({ physicalForm: event.target.value })}
            />
          </div>
          <div className="ps-field">
            <label htmlFor="ps-age-grade">Age grade</label>
            <select
              id="ps-age-grade"
              className="ps-in"
              value={draft.ageGrade}
              onChange={(event) =>
                patch({
                  ageGrade: event.target.value,
                  ageGroup: event.target.value === '12+' ? '12_and_above' : 'under_12',
                })
              }
            >
              {AGE_GRADE_OPTIONS.map((grade) => (
                <option key={grade} value={grade}>
                  Ages {grade}
                </option>
              ))}
            </select>
          </div>
          <div className="ps-field">
            <label htmlFor="f-swatch">Product color</label>
            <div className="ps-color-in">
              <input
                id="f-swatch"
                type="color"
                value={swatchColor}
                onInput={(event) => patch({ productColor: event.currentTarget.value })}
                onChange={(event) => patch({ productColor: event.target.value })}
                aria-label="Product color"
              />
              <span id="f-swatch-hex" className="ps-mono ps-small ps-muted">
                {swatchColor.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="ps-field wide">
            <label htmlFor="ps-intended-use">Intended use</label>
            <textarea
              id="ps-intended-use"
              className="ps-in"
              rows={2}
              value={draft.intendedUse}
              onChange={(event) => patch({ intendedUse: event.target.value })}
            />
          </div>
          <div className="ps-field wide">
            <span className="ps-flabel">Markets</span>
            <div className="ps-mkts" role="group" aria-label="Target markets">
              {TARGET_MARKETS.map((market) => (
                <label key={market.code} className="ps-mkt">
                  <input
                    type="checkbox"
                    checked={draft.targetMarkets.includes(market.code)}
                    onChange={(event) => toggleMarket(market.code, event.target.checked)}
                  />
                  {market.label}
                </label>
              ))}
            </div>
            {submitAttempted && !draft.targetMarkets.length ? (
              <span className="text-xs text-red-600">Select at least one market.</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="ps-panel" aria-labelledby="ps-comp-heading">
        <div className="ps-panel-head row">
          <div>
            <h2 id="ps-comp-heading">
              <span className="ps-sn">2</span>
              Composition
            </h2>
            <p className="ps-panel-sub">Every ingredient, with CAS number, % by weight and supplier documents.</p>
          </div>
        </div>
        <div className="ps-tbl-wrap">
          <table className="ps-tbl comp">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>CAS no.</th>
                <th>Function</th>
                <th className="num">% w/w</th>
                <th>Supplier</th>
                <th>SDS</th>
                <th>CoA</th>
                <th>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.ingredients.map((row, rowIndex) => {
                const errors = submitAttempted ? rowErrors(row, draft.ingredients) : {};
                const labelName = row.name || 'ingredient';
                const selectId = `ing-${rowIndex}-id`;
                return (
                  <tr key={row.key}>
                    <td>
                      <IngredientSelect
                        selectId={selectId}
                        rowIndex={rowIndex}
                        options={ingredientOptions}
                        contaminantOptions={contaminantOptions}
                        loading={catalog.loading}
                        catalogId={row.catalogId}
                        custom={row.custom}
                        customName={row.name}
                        onSelectCatalog={(value) => selectIngredient(row.key, value)}
                        onCustomName={(name) => patchRow(row.key, { custom: true, name })}
                        onBackToList={() =>
                          patchRow(row.key, {
                            custom: false,
                            catalogId: undefined,
                            name: '',
                            cas: '',
                            functionLabel: '',
                            inRuleCatalog: undefined,
                            screeningRole: undefined,
                          })
                        }
                      />
                      {errors.duplicate ? (
                        <span className="sr-only">{errors.duplicate}</span>
                      ) : null}
                    </td>
                    <td className="ps-cas">
                      {row.custom ? (
                        <input
                          className="ps-in mono"
                          style={{ width: 120 }}
                          value={row.cas === '-' ? '' : row.cas}
                          placeholder="7732-18-5"
                          aria-label={`CAS number for ${labelName}`}
                          title={errors.cas}
                          onChange={(event) => patchRow(row.key, { cas: event.target.value })}
                        />
                      ) : (
                        row.cas || '-'
                      )}
                    </td>
                    <td className="ps-fn">{row.functionLabel || '-'}</td>
                    <td className="num">
                      <label className="sr-only" htmlFor={`ing-${rowIndex}-pct`}>
                        Percent by weight
                      </label>
                      <input
                        id={`ing-${rowIndex}-pct`}
                        className="ps-in num"
                        type="number"
                        step={0.001}
                        min={0}
                        max={100}
                        value={row.pct}
                        data-row={rowIndex}
                        data-field="pct"
                        aria-label={`Percent by weight for ${labelName}`}
                        title={errors.pct}
                        onChange={(event) => patchRow(row.key, { pct: event.target.value })}
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`ing-${rowIndex}-sup`}>
                        Supplier
                      </label>
                      <input
                        id={`ing-${rowIndex}-sup`}
                        className="ps-in"
                        type="text"
                        value={row.supplier}
                        placeholder="Supplier"
                        data-row={rowIndex}
                        data-field="supplier"
                        aria-label={`Supplier for ${labelName}`}
                        onChange={(event) => patchRow(row.key, { supplier: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.sdsAvailable}
                        aria-label={`SDS on file for ${labelName}`}
                        onChange={(event) => patchRow(row.key, { sdsAvailable: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.coaAvailable}
                        aria-label={`CoA on file for ${labelName}`}
                        onChange={(event) => patchRow(row.key, { coaAvailable: event.target.checked })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ps-icon-btn"
                        aria-label={`Remove ${labelName}`}
                        onClick={() =>
                          patch({
                            ingredients: draft.ingredients.filter((item) => item.key !== row.key),
                          })
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ps-comp-foot">
          <button
            type="button"
            className="ps-btn-ghost"
            onClick={() => patch({ ingredients: [...draft.ingredients, emptyCompositionRow()] })}
          >
            + Add ingredient
          </button>
          <div className="ps-total-wrap">
            <button
              type="button"
              className="ps-btn-secondary"
              onClick={() => patch({ ingredients: rebalancePercentages(draft.ingredients) })}
            >
              Rebalance
            </button>
            <CompositionTotalMeter rows={draft.ingredients} />
          </div>
        </div>
      </section>

      <SupportingFilesSection
        draft={draft}
        onChange={(files) => patch({ files })}
        onLinkIngredient={patchRow}
        onApplyComposition={(ingredients) => patch({ ingredients })}
      />

      <div className="ps-actionbar">
        <span className="ps-muted">Takes a few seconds. Nothing is sent to ACMI.</span>
        <div className="ps-head-actions">
          <button type="button" className="ps-btn" disabled={saving || running} onClick={() => void saveDraft()}>
            Save draft
          </button>
          {runPrecheckHint ? (
            <span id="ps-run-hint" className="sr-only">
              {runPrecheckHint}
            </span>
          ) : null}
          <button
            type="button"
            className="ps-btn ps-btn-primary"
            disabled={!canRun || saving || running}
            title={!canRun ? runPrecheckHint : undefined}
            aria-describedby={runPrecheckHint ? 'ps-run-hint' : undefined}
            onClick={() => void runPrecheck()}
          >
            Run pre-check
          </button>
        </div>
      </div>

      <ScreeningProgressOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </div>
  );
}
