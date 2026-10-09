import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { AgeGroup, Formula, PhysicalForm, ProductCategory, TargetMarket } from '../../types/domain';
import { AGE_GROUP_LABEL, AGE_GROUPS, PHYSICAL_FORMS, PRODUCT_CATEGORIES, SCREENING_MARKETS, TARGET_MARKETS } from '../../types/domain';
import type { FormulaInput } from '../../types/services';
import { type AssessmentMode } from '../../api/formulaBackend';
import { useDemoSelector, useServices, useSettings } from '../../state/DemoDataProvider';
import { useAsyncAction } from '../../hooks/useAsyncData';
import { useToast } from '../ui/Toast';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Checkbox, Field, SearchSelect, Select, TextArea, TextInput } from '../ui/Field';
import { FormStepper, type StepDescriptor } from '../ui/Stepper';
import { Notice } from '../ui/DemoNotice';
import { Badge } from '../ui/Badge';
import {
  fieldError,
  issuesForStep,
  validateFormulaInput,
  type ValidationIssue,
} from '../../utils/validation';
import { formatConcentration } from '../../utils/formatting';
import { cn } from '../../utils/cn';

const STEPS: StepDescriptor[] = [
  { id: 'details', label: 'Product details' },
  { id: 'ingredients', label: 'Ingredients' },
  { id: 'evidence', label: 'Evidence & use' },
  { id: 'review', label: 'Review & save' },
];

interface IngredientRow {
  key: string;
  id?: string;
  name: string;
  rawMaterialId: string;
  concentrationText: string;
  supplier: string;
  notes: string;
  batchId: string;
  addedInVersion?: string;
  compositionType: string;
  screeningRole: string;
  needsCorrection: boolean;
  measuredText: string;
  measuredUnit: string;
  measurementKind: string;
  testMethod: string;
  section: 'formulation' | 'contaminant';
}

interface CatalogSubstance {
  substance_id: string;
  label: string;
  role: string;
  role_label: string;
  regions: string[];
  composition_types: string[];
}

interface FormState {
  name: string;
  version: string;
  category: string;
  ageGroup: string;
  targetMarkets: TargetMarket[];
  physicalForm: string;
  intendedUse: string;
  ownerId: string;
  reviewerId: string;
  description: string;
  ingredients: IngredientRow[];
  evidenceIds: string[];
  preferredAssessmentMode?: AssessmentMode;
  compositionCompleteness: 'partial' | 'complete';
  usStates: string[];
  intendedAgeDetail: string;
  toyChildcareScope: string;
  componentType: string;
  testMaterialCategory: string;
}

let rowCounter = 0;
const nextKey = () => {
  rowCounter += 1;
  return `row-${rowCounter}`;
};

function emptyRow(section: 'formulation' | 'contaminant' = 'formulation'): IngredientRow {
  return {
    key: nextKey(),
    name: '',
    rawMaterialId: '',
    concentrationText: '',
    supplier: '',
    notes: '',
    batchId: '',
    compositionType: '',
    screeningRole: section === 'contaminant' ? 'contaminant_analyte' : '',
    needsCorrection: false,
    measuredText: '',
    measuredUnit: 'mg/kg',
    measurementKind: '',
    testMethod: '',
    section,
  };
}

function toFormState(formula: Formula | undefined, defaults: { ownerId: string; reviewerId: string }): FormState {
  if (!formula) {
    return {
      name: '',
      version: 'v1.0',
      category: '',
      ageGroup: '',
      targetMarkets: [],
      physicalForm: '',
      intendedUse: '',
      ownerId: defaults.ownerId,
      reviewerId: defaults.reviewerId,
      description: '',
      ingredients: [emptyRow(), emptyRow()],
      evidenceIds: [],
      compositionCompleteness: 'partial',
      usStates: [],
      intendedAgeDetail: '',
      toyChildcareScope: '',
      componentType: 'finished_formula',
      testMaterialCategory: '',
    };
  }

  return {
    name: formula.name,
    version: formula.version,
    category: formula.category,
    ageGroup: formula.ageGroupNeedsSelection ? '' : formula.ageGroup,
    targetMarkets: [...(formula.targetMarkets ?? [])],
    physicalForm: formula.physicalForm,
    intendedUse: formula.intendedUse,
    ownerId: formula.ownerId,
    reviewerId: formula.reviewerId ?? '',
    description: formula.description ?? '',
    ingredients: formula.ingredients.map((ingredient) => ({
      key: nextKey(),
      id: ingredient.id,
      name: ingredient.name,
      rawMaterialId: ingredient.rawMaterialId ?? '',
      concentrationText: String(ingredient.concentration),
      supplier: ingredient.supplier ?? '',
      notes: ingredient.notes ?? '',
      batchId: ingredient.batchId ?? '',
      addedInVersion: ingredient.addedInVersion,
      compositionType: ingredient.compositionType ?? '',
      screeningRole: ingredient.screeningRole ?? '',
      needsCorrection: Boolean(ingredient.needsCorrection),
      measuredText: ingredient.measuredValue == null ? '' : String(ingredient.measuredValue),
      measuredUnit: ingredient.measuredUnit ?? 'mg/kg',
      measurementKind: ingredient.measurementKind ?? '',
      testMethod: ingredient.testMethod ?? '',
      section: ingredient.screeningRole === 'contaminant_analyte' || ingredient.measurementKind === 'migration' || ingredient.measurementKind === 'content' ? 'contaminant' : 'formulation',
    })),
    evidenceIds: [...formula.evidenceIds],
    preferredAssessmentMode: formula.preferredAssessmentMode,
    compositionCompleteness: formula.compositionCompleteness ?? 'partial',
    usStates: [...(formula.usStates ?? [])],
    intendedAgeDetail: formula.intendedAgeDetail ?? '',
    toyChildcareScope: formula.toyChildcareScope ?? '',
    componentType: formula.componentType ?? 'finished_formula',
    testMaterialCategory: formula.testMaterialCategory ?? '',
  };
}

function toInput(form: FormState, lifecycle: 'draft' | 'active'): FormulaInput {
  return {
    name: form.name,
    version: form.version,
    category: (form.category || undefined) as ProductCategory | undefined,
    ageGroup: (form.ageGroup || undefined) as AgeGroup | undefined,
    targetMarkets: form.targetMarkets,
    physicalForm: (form.physicalForm || undefined) as PhysicalForm | undefined,
    intendedUse: form.intendedUse,
    ownerId: form.ownerId,
    reviewerId: form.reviewerId || undefined,
    description: form.description || undefined,
    lifecycle,
    ingredients: form.ingredients
      .filter((row) => row.name.trim() || row.concentrationText.trim() || row.rawMaterialId)
      .map((row) => ({
        id: row.id,
        name: row.name,
        rawMaterialId: row.rawMaterialId || undefined,
        concentration: row.concentrationText.trim() === '' ? Number.NaN : Number(row.concentrationText),
        supplier: row.supplier || undefined,
        notes: row.notes || undefined,
        batchId: row.batchId.trim() || undefined,
        addedInVersion: row.addedInVersion,
        compositionType: row.compositionType || undefined,
        screeningRole: (row.screeningRole || undefined) as FormulaInput['ingredients'][number]['screeningRole'],
        needsCorrection: row.needsCorrection,
        measuredValue: row.section === 'contaminant' && row.measuredText.trim() !== '' ? Number(row.measuredText) : undefined,
        measuredUnit: row.section === 'contaminant' ? row.measuredUnit || undefined : undefined,
        measurementKind: row.section === 'contaminant' ? row.measurementKind || undefined : undefined,
        testMethod: row.section === 'contaminant' ? row.testMethod || undefined : undefined,
      })),
    evidenceIds: form.evidenceIds,
    preferredAssessmentMode: form.preferredAssessmentMode,
    compositionCompleteness: form.compositionCompleteness,
    usStates: form.usStates,
    intendedAgeDetail: form.intendedAgeDetail || undefined,
    toyChildcareScope: form.toyChildcareScope || undefined,
    componentType: form.componentType || undefined,
    testMaterialCategory: form.testMaterialCategory || undefined,
  };
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return (
    <div className="space-y-2">
      {errors.length > 0 ? (
        <Notice tone="danger" title={`${errors.length} item${errors.length === 1 ? '' : 's'} must be fixed`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {errors.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {warnings.length > 0 ? (
        <Notice tone="warning" title={`${warnings.length} item${warnings.length === 1 ? '' : 's'} to review`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}

export function FormulaFormDrawer({
  open,
  onClose,
  mode,
  formula,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  formula?: Formula;
  onSaved?: (formula: Formula) => void;
}) {
  const services = useServices();
  const toast = useToast();
  const settings = useSettings();
  const people = useDemoSelector((state) => state.people);
  const documents = useDemoSelector((state) => state.documents);

  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [form, setForm] = useState<FormState>(() =>
    toFormState(formula, { ownerId: settings.currentUserId, reviewerId: settings.defaultReviewerId }),
  );
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [substances, setSubstances] = useState<CatalogSubstance[]>([]);
  const [materialTypes, setMaterialTypes] = useState<string[]>([]);
  const [catalogNote, setCatalogNote] = useState('Catalog coverage incomplete.');
  const [catalogError, setCatalogError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setForm(toFormState(formula, { ownerId: settings.currentUserId, reviewerId: settings.defaultReviewerId }));
    setStep(0);
    setFurthest(0);
    setShowAllIssues(false);
  }, [open, formula, settings.currentUserId, settings.defaultReviewerId]);

  const screeningMarkets = form.targetMarkets.filter((market) => market === 'US' || market === 'EU');

  useEffect(() => {
    if (!open || !form.category || !form.ageGroup || screeningMarkets.length === 0) {
      setSubstances([]);
      setMaterialTypes([]);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      regions: screeningMarkets.join(','),
      category: form.category,
      age_group: form.ageGroup,
    });
    setCatalogError(undefined);
    Promise.all([
      fetch(`/api/reference/material-types?${params}`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/reference/substances?${params}`, { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([types, substanceBody]) => {
        const nextTypes = (types.composition_types ?? []) as string[];
        const nextSubstances = (substanceBody.substances ?? []) as CatalogSubstance[];
        setMaterialTypes(nextTypes);
        setSubstances(nextSubstances);
        setCatalogNote(substanceBody.coverage_note || 'Catalog coverage incomplete.');
        const ids = new Set(nextSubstances.map((item) => item.substance_id));
        setForm((current) => ({
          ...current,
          ingredients: current.ingredients.map((row) => {
            if (!row.rawMaterialId) return row;
            const match = nextSubstances.find((item) => item.substance_id === row.rawMaterialId);
            const typeOk = !row.compositionType || !match || match.composition_types.includes(row.compositionType);
            return { ...row, needsCorrection: !match || !ids.has(row.rawMaterialId) || !typeOk };
          }),
        }));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setCatalogError(cause instanceof Error ? cause.message : 'The reference catalog could not be loaded.');
      });
    return () => controller.abort();
  }, [open, form.category, form.ageGroup, screeningMarkets.join(',')]);

  const validation = useMemo(() => validateFormulaInput(toInput(form, 'active')), [form]);

  const catalogIds = useMemo(() => new Set(substances.map((item) => item.substance_id)), [substances]);

  const linkableDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          (document.type === 'Laboratory Report' || document.type === 'Correspondence') &&
          (!document.formulaId || document.formulaId === formula?.id),
      ),
    [documents, formula?.id],
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const updateRow = (key: string, patch: Partial<IngredientRow>) =>
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));

  const addRow = (section: 'formulation' | 'contaminant' = 'formulation') =>
    setForm((current) => ({ ...current, ingredients: [...current.ingredients, emptyRow(section)] }));

  const removeRow = (key: string) =>
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.filter((row) => row.key !== key),
    }));

  const save = useAsyncAction(async (lifecycle: 'draft' | 'active') => {
    const input = toInput(form, lifecycle);
    const saved =
      mode === 'edit' && formula
        ? await services.updateFormula(formula.id, input)
        : await services.createFormula(input);

    toast.success(
      mode === 'edit' ? 'Formula updated' : lifecycle === 'draft' ? 'Draft saved' : 'Formula created',
      lifecycle === 'draft'
        ? `${saved.name} was saved as a draft. Missing fields are listed on the formula record.`
        : `${saved.name} ${saved.version} is ready to screen.`,
    );
    onSaved?.(saved);
    onClose();
    return saved;
  });

  const total = validation.total;
  const withinTolerance = validation.totalWithinTolerance;
  const stepIssues = issuesForStep(validation, Math.min(step + 1, 3) as 1 | 2 | 3);

  const goTo = (index: number) => {
    setStep(index);
    setFurthest((value) => Math.max(value, index));
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      eyebrow={mode === 'edit' ? 'Edit formula' : 'New formula'}
      title={mode === 'edit' ? (formula?.name ?? 'Edit formula') : 'Create a formula'}
      subtitle="Drafts can be saved with missing fields and completed later."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            {validation.errors.length === 0 ? (
              <>
                <CheckCircle2 aria-hidden className="size-4 text-success" />
                Ready to save as a complete record
              </>
            ) : (
              <>
                <AlertTriangle aria-hidden className="size-4 text-warning" />
                {validation.errors.length} required{' '}
                {validation.errors.length === 1 ? 'item is' : 'items are'} incomplete
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onClose} disabled={save.pending}>
              Cancel
            </Button>
            {step > 0 ? (
              <Button onClick={() => goTo(step - 1)} disabled={save.pending}>
                Back
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => goTo(step + 1)}>
                Continue
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => void save.run('draft')}
                  loading={save.pending}
                  disabled={form.name.trim().length < 3}
                  title={form.name.trim().length < 3 ? 'Enter a formula name first' : undefined}
                >
                  Save as draft
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void save.run('active')}
                  loading={save.pending}
                  disabled={validation.errors.length > 0}
                >
                  {mode === 'edit' ? 'Save changes' : 'Save formula'}
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <FormStepper steps={STEPS} current={step} furthest={furthest} onSelect={goTo} />

        {step === 0 ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Formula name"
                htmlFor="formula-name"
                required
                error={fieldError(validation, 'name')}
                className="sm:col-span-2"
              >
                <TextInput
                  id="formula-name"
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder="e.g. ColorFlow Brush Marker"
                  invalid={Boolean(fieldError(validation, 'name'))}
                />
              </Field>

              <Field label="Version" htmlFor="formula-version" hint="Used to track revisions, e.g. v1.0">
                <TextInput
                  id="formula-version"
                  value={form.version}
                  onChange={(event) => update('version', event.target.value)}
                />
              </Field>

              <Field
                label="Product category"
                htmlFor="formula-category"
                required
                error={fieldError(validation, 'category')}
              >
                <Select
                  id="formula-category"
                  value={form.category}
                  placeholder="Select a category"
                  options={PRODUCT_CATEGORIES.map((category) => ({ value: category, label: category }))}
                  onChange={(event) => update('category', event.target.value)}
                  invalid={Boolean(fieldError(validation, 'category'))}
                />
              </Field>

              <Field
                label="Intended age group"
                htmlFor="formula-age"
                required
                error={fieldError(validation, 'ageGroup')}
                hint="Audience category for this application. It is not a legal age definition for every market."
              >
                <div id="formula-age" className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Intended age group">
                  {AGE_GROUPS.map((group) => {
                    const selected = form.ageGroup === group;
                    return (
                      <button
                        key={group}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => update('ageGroup', group)}
                        className={cn(
                          'h-10 flex-1 rounded-lg border px-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
                          selected
                            ? 'border-brand-500 bg-brand-50 text-brand-600'
                            : 'border-line bg-white text-ink hover:border-brand-200',
                        )}
                      >
                        {AGE_GROUP_LABEL[group]}
                      </button>
                    );
                  })}
                </div>
                {formula?.recordedAgeGroup ? (
                  <p className="mt-1.5 text-xs text-muted">Previously recorded age: {formula.recordedAgeGroup}</p>
                ) : null}
                {formula?.ageGroupNeedsSelection ? (
                  <p className="mt-1.5 text-xs text-warning">The previous age range covers both categories. Select one.</p>
                ) : null}
              </Field>

              <Field
                label="Target markets"
                htmlFor="formula-markets"
                required
                className="sm:col-span-2"
                error={fieldError(validation, 'targetMarkets')}
              >
                <div id="formula-markets" className="flex flex-wrap gap-2" role="group" aria-label="Target markets">
                  {SCREENING_MARKETS.map((market) => {
                    const selected = form.targetMarkets.includes(market.code);
                    return (
                      <button
                        key={market.code}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          update(
                            'targetMarkets',
                            selected
                              ? form.targetMarkets.filter((code) => code !== market.code)
                              : [...form.targetMarkets, market.code],
                          )
                        }
                        className={cn(
                          'h-10 rounded-full border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
                          selected
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-line bg-white text-ink hover:border-brand-200 hover:bg-brand-50',
                        )}
                      >
                        {market.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field
                label="Physical form"
                htmlFor="formula-form"
                required
                error={fieldError(validation, 'physicalForm')}
              >
                <Select
                  id="formula-form"
                  value={form.physicalForm}
                  placeholder="Select a form"
                  options={PHYSICAL_FORMS.map((physicalForm) => ({ value: physicalForm, label: physicalForm }))}
                  onChange={(event) => update('physicalForm', event.target.value)}
                  invalid={Boolean(fieldError(validation, 'physicalForm'))}
                />
              </Field>

              <Field label="Owner" htmlFor="formula-owner" required error={fieldError(validation, 'ownerId')}>
                <Select
                  id="formula-owner"
                  value={form.ownerId}
                  placeholder="Select an owner"
                  options={people.map((person) => ({ value: person.id, label: `${person.name} · ${person.role}` }))}
                  onChange={(event) => update('ownerId', event.target.value)}
                />
              </Field>

              <Field label="Assigned reviewer" htmlFor="formula-reviewer" hint="Optional at this stage">
                <Select
                  id="formula-reviewer"
                  value={form.reviewerId}
                  placeholder="Unassigned"
                  options={people.map((person) => ({ value: person.id, label: `${person.name} · ${person.role}` }))}
                  onChange={(event) => update('reviewerId', event.target.value)}
                />
              </Field>

              <Field label="Internal note" htmlFor="formula-description" className="sm:col-span-2">
                <TextArea
                  id="formula-description"
                  rows={2}
                  value={form.description}
                  onChange={(event) => update('description', event.target.value)}
                  placeholder="Short note for the team, e.g. what changed in this revision."
                />
              </Field>
            </div>

            {catalogError ? (
              <Notice tone="danger" title="Reference catalog could not be loaded">
                {catalogError}
              </Notice>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <Notice tone="warning" title="Catalog coverage incomplete">
              {catalogNote} This list is not an approved recipe. Restricted substances and laboratory analytes stay separate from formulation ingredients.
            </Notice>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Composition declaration">
                <Select
                  value={form.compositionCompleteness}
                  options={[
                    { value: 'partial', label: 'Partial substance screening' },
                    { value: 'complete', label: 'Declared ingredient list totals 100%' },
                  ]}
                  onChange={(event) => update('compositionCompleteness', event.target.value as 'partial' | 'complete')}
                />
              </Field>
              <Field label="Component the concentration describes">
                <Select
                  value={form.componentType}
                  options={[
                    { value: 'finished_formula', label: 'Finished formula' },
                    { value: 'plasticised_material', label: 'Plasticised material' },
                    { value: 'substrate', label: 'Substrate' },
                    { value: 'surface_coating', label: 'Surface coating' },
                    { value: 'dried_film', label: 'Dried film' },
                  ]}
                  onChange={(event) => update('componentType', event.target.value)}
                />
              </Field>
              {form.targetMarkets.includes('US') ? (
                <Field label="US state, when a state rule should apply" hint="Leave unset for a generic US assessment. State rules are not applied automatically.">
                  <Select
                    value={form.usStates[0] ?? ''}
                    placeholder="No state selected"
                    options={[
                      { value: 'WA', label: 'Washington' },
                      { value: 'VT', label: 'Vermont' },
                      { value: 'CA', label: 'California' },
                    ]}
                    onChange={(event) => update('usStates', event.target.value ? [event.target.value] : [])}
                  />
                </Field>
              ) : null}
              <Field label="Intended age within the band" hint="The age band only filters the catalog. Narrower rule boundaries stay unresolved until this is selected.">
                <Select
                  value={form.intendedAgeDetail}
                  placeholder="Not specified"
                  options={[
                    { value: 'under_36_months', label: 'Under 36 months' },
                    { value: 'age_3_to_under_6', label: '3 to under 6' },
                    { value: 'age_6_to_under_12', label: '6 to under 12' },
                    { value: 'age_12_to_under_14', label: '12 to under 14' },
                    { value: 'age_14_plus', label: '14 and above' },
                  ]}
                  onChange={(event) => update('intendedAgeDetail', event.target.value)}
                />
              </Field>
              <Field label="Toy or childcare article">
                <Select
                  value={form.toyChildcareScope}
                  placeholder="Not specified"
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                    { value: 'unknown', label: 'Unknown' },
                  ]}
                  onChange={(event) => update('toyChildcareScope', event.target.value)}
                />
              </Field>
              <Field label="Test material category">
                <Select
                  value={form.testMaterialCategory}
                  placeholder="Not specified"
                  options={[
                    { value: 'en71_cat_i', label: 'EN 71-3 Category I' },
                    { value: 'en71_cat_ii', label: 'EN 71-3 Category II' },
                    { value: 'en71_cat_iii', label: 'EN 71-3 Category III' },
                  ]}
                  onChange={(event) => update('testMaterialCategory', event.target.value)}
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted">
                {form.compositionCompleteness === 'partial'
                  ? 'Partial composition. Formulation percentages do not need to total 100%. Contaminant rows are excluded.'
                  : 'A declared complete list must total 100% within ±0.01%.'}
              </p>
              <Badge tone={form.compositionCompleteness === 'partial' || withinTolerance ? 'success' : 'warning'}>
                Formulation total {formatConcentration(total)}
              </Badge>
            </div>

            <div className="space-y-3">
              {form.ingredients.map((row, index) => {
                const rowErrors = validation.errors.filter((issue) => issue.ingredientIndex === index);
                const unmapped = Boolean(row.needsCorrection || (row.rawMaterialId && substances.length > 0 && !catalogIds.has(row.rawMaterialId)));
                const choices = substances.filter((item) => {
                  if (row.compositionType && !item.composition_types.includes(row.compositionType)) return false;
                  if (row.section === 'contaminant') return item.role !== 'formulation_ingredient';
                  return item.role !== 'contaminant_analyte';
                });
                return (
                  <div
                    key={row.key}
                    className={cn(
                      'rounded-lg border p-3',
                      rowErrors.length > 0 || unmapped ? 'border-danger-line bg-danger-soft/30' : 'border-line bg-canvas/50',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
                        {row.section === 'contaminant' ? 'Contaminant / analyte' : 'Formulation ingredient'} {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        disabled={form.ingredients.length <= 1}
                        aria-label={`Remove ingredient ${index + 1}`}
                        className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-12">
                      <Field label="Material type" className="sm:col-span-4">
                        <Select
                          value={row.compositionType}
                          placeholder="Select a material type"
                          options={materialTypes.map((item) => ({ value: item, label: item }))}
                          onChange={(event) => updateRow(row.key, { compositionType: event.target.value })}
                        />
                      </Field>
                      <Field label="Substance" className="sm:col-span-8" hint="Search the catalog. Unlisted substances cannot be added.">
                        <SearchSelect
                          value={row.rawMaterialId}
                          placeholder="Search substance or CAS"
                          options={choices.map((item) => ({
                            value: item.substance_id,
                            label: `${item.label}${item.role === 'role_requires_review' ? ' · Role requires review' : ''} · ${item.regions.join('/')}`,
                          }))}
                          invalid={unmapped}
                          onChange={(materialId) => {
                            const match = substances.find((item) => item.substance_id === materialId);
                            updateRow(row.key, {
                              rawMaterialId: materialId,
                              name: match?.label ?? row.name,
                              screeningRole: match?.role ?? row.screeningRole,
                              compositionType: row.compositionType || match?.composition_types[0] || '',
                              needsCorrection: false,
                            });
                          }}
                        />
                      </Field>
                      {row.section === 'contaminant' ? (
                        <>
                          <Field label="Result type" className="sm:col-span-3">
                            <Select
                              value={row.measurementKind}
                              placeholder="Select a basis"
                              options={[
                                { value: 'content', label: 'Total content' },
                                { value: 'migration', label: 'Migration' },
                              ]}
                              onChange={(event) => updateRow(row.key, { measurementKind: event.target.value })}
                            />
                          </Field>
                          <Field label="Measured result" className="sm:col-span-2">
                            <TextInput
                              inputMode="decimal"
                              value={row.measuredText}
                              onChange={(event) => updateRow(row.key, { measuredText: event.target.value.replace(/[^0-9.]/g, '') })}
                              placeholder="0.00"
                              className="tabular"
                            />
                          </Field>
                          <Field label="Unit" className="sm:col-span-2">
                            <Select
                              value={row.measuredUnit}
                              options={[
                                { value: 'mg/kg', label: 'mg/kg' },
                                { value: 'ppm', label: 'ppm' },
                                { value: '%', label: '%' },
                                { value: 'µg/g', label: 'µg/g' },
                              ]}
                              onChange={(event) => updateRow(row.key, { measuredUnit: event.target.value })}
                            />
                          </Field>
                          <Field label="Test method" className="sm:col-span-5" hint="Required before a migration limit can be evaluated.">
                            <TextInput
                              value={row.testMethod}
                              onChange={(event) => updateRow(row.key, { testMethod: event.target.value })}
                              placeholder="e.g. EN 71-3"
                            />
                          </Field>
                        </>
                      ) : (
                        <Field label="Concentration %" className="sm:col-span-3">
                          <TextInput
                            inputMode="decimal"
                            value={row.concentrationText}
                            onChange={(event) => updateRow(row.key, { concentrationText: event.target.value.replace(/[^0-9.]/g, '') })}
                            placeholder="0.00"
                            className="tabular"
                            invalid={rowErrors.some((issue) => issue.field.endsWith('concentration'))}
                          />
                        </Field>
                      )}

                      <Field label="Supplier" className="sm:col-span-4">
                        <TextInput
                          value={row.supplier}
                          onChange={(event) => updateRow(row.key, { supplier: event.target.value })}
                          placeholder="Supplier name"
                        />
                      </Field>

                      <Field label="Batch" className="sm:col-span-3">
                        <TextInput
                          value={row.batchId}
                          onChange={(event) => updateRow(row.key, { batchId: event.target.value })}
                          placeholder="Optional"
                        />
                      </Field>

                      <Field label="Note" className="sm:col-span-5">
                        <TextInput
                          value={row.notes}
                          onChange={(event) => updateRow(row.key, { notes: event.target.value })}
                          placeholder="Optional"
                        />
                      </Field>
                    </div>
                    {unmapped ? (
                      <p className="mt-2 text-xs text-danger">
                        This row still uses a legacy identity. Select the correct catalog material. Names are not matched by similarity.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => addRow('formulation')} icon={<Plus aria-hidden className="size-4" />}>
                Add formulation ingredient
              </Button>
              <Button variant="subtle" onClick={() => addRow('contaminant')} icon={<Plus aria-hidden className="size-4" />}>
                Add contaminant / analyte
              </Button>
            </div>

            <IssueList issues={stepIssues} />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <Field
              label="Intended use"
              htmlFor="formula-use"
              required
              error={fieldError(validation, 'intendedUse')}
              hint="Describe how the finished product is used — this drives the exposure-readiness panel."
            >
              <TextArea
                id="formula-use"
                rows={3}
                value={form.intendedUse}
                onChange={(event) => update('intendedUse', event.target.value)}
                placeholder="e.g. Broad-line colouring marker for classroom use on paper."
                invalid={Boolean(fieldError(validation, 'intendedUse'))}
              />
            </Field>

            <div>
              <p className="mb-1 text-[13px] font-medium text-ink">Evidence references</p>
              <p className="mb-2.5 text-xs text-muted">
                Link formula-level documents. Supplier documents are resolved automatically from each
                ingredient&rsquo;s raw-material reference.
              </p>
              {linkableDocuments.length === 0 ? (
                <p className="rounded-lg border border-line bg-canvas px-3 py-3 text-[13px] text-muted">
                  No formula-level documents are available to link yet.
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-line p-3">
                  {linkableDocuments.map((document) => (
                    <Checkbox
                      key={document.id}
                      checked={form.evidenceIds.includes(document.id)}
                      onChange={(event) =>
                        update(
                          'evidenceIds',
                          event.target.checked
                            ? [...form.evidenceIds, document.id]
                            : form.evidenceIds.filter((id) => id !== document.id),
                        )
                      }
                      label={document.title}
                      description={`${document.type} · ${document.id}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <IssueList issues={stepIssues} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-line">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-3">
                {[
                  ['Name', form.name || 'New Formula'],
                  ['Version', form.version || '—'],
                  ['Category', form.category || '—'],
                  ['Age group', form.ageGroup ? AGE_GROUP_LABEL[form.ageGroup as AgeGroup] : '—'],
                  ['Target markets', form.targetMarkets.map((code) => TARGET_MARKETS.find((market) => market.code === code)?.label ?? code).join(', ') || '—'],
                  ['Physical form', form.physicalForm || '—'],
                  ['Owner', people.find((person) => person.id === form.ownerId)?.name ?? '—'],
                  ['Ingredients', String(form.ingredients.filter((row) => row.name.trim()).length)],
                  ['Composition total', formatConcentration(total)],
                  ['Linked documents', String(form.evidenceIds.length)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{label}</dt>
                    <dd className="mt-0.5 text-sm text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {validation.missingFieldLabels.length > 0 ? (
              <Notice tone="warning" title="Missing for a complete record">
                {validation.missingFieldLabels.join(', ')}. You can still save this as a draft — the formula
                record will list what is outstanding.
              </Notice>
            ) : (
              <Notice tone="success" title="All required fields are complete">
                Saving will create an active record. Screening has not run yet, so the formula starts with no
                screening result.
              </Notice>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowAllIssues((value) => !value)}
                className="text-[13px] font-medium text-brand-500 hover:underline"
                aria-expanded={showAllIssues}
              >
                {showAllIssues ? 'Hide' : 'Show'} all validation messages ({validation.issues.length})
              </button>
              {showAllIssues ? (
                <div className="mt-2">
                  <IssueList issues={validation.issues} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
