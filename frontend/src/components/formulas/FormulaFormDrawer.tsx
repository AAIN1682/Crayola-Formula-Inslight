import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { AgeGroup, Formula, PhysicalForm, ProductCategory, TargetMarket } from '../../types/domain';
import { AGE_GROUP_LABEL, AGE_GROUPS, PHYSICAL_FORMS, PRODUCT_CATEGORIES, SCREENING_MARKETS, TARGET_MARKETS } from '../../types/domain';
import type { FormulaInput } from '../../types/services';
import { type AssessmentMode } from '../../api/formulaBackend';
import { useServices } from '../../state/DemoDataProvider';
import { useAsyncAction } from '../../hooks/useAsyncData';
import { useToast } from '../ui/Toast';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { choiceForId, formulationChoices, formulationMaterial } from '../../data/formulationMaterials';
import { Field, Select, TextArea, TextInput } from '../ui/Field';
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
  { id: 'evidence', label: 'Documents and intended use' },
  { id: 'review', label: 'Review & save' },
];

interface IngredientRow {
  key: string;
  id?: string;
  name: string;
  rawMaterialId: string;
  concentrationText: string;
  supplier: string;
  grade: string;
  notes: string;
  batchId: string;
  addedInVersion?: string;
  compositionType: string;
  casNumber: string;
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
  cas_number?: string | null;
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
    grade: '',
    notes: '',
    batchId: '',
    compositionType: '',
    casNumber: '',
    screeningRole: section === 'contaminant' ? 'contaminant_analyte' : '',
    needsCorrection: false,
    measuredText: '',
    measuredUnit: 'mg/kg',
    measurementKind: '',
    testMethod: '',
    section,
  };
}

const DEFAULT_PEOPLE = [
  { id: 'usr-dana', name: 'Dana Whitfield', role: 'Formulation Scientist' },
  { id: 'usr-marcus', name: 'Marcus Ellery', role: 'Product Safety Specialist' },
  { id: 'usr-priya', name: 'Priya Raman', role: 'Regulatory Reviewer' },
  { id: 'usr-theo', name: 'Theo Kowalski', role: 'R&D Manager' },
  { id: 'usr-elena', name: 'Elena Barros', role: 'Formulation Scientist' },
  { id: 'usr-jordan', name: 'Jordan Hale', role: 'Quality Reviewer' },
];

const PEOPLE_OPTIONS = DEFAULT_PEOPLE.map((person) => ({ value: person.id, label: `${person.name} · ${person.role}` }));

function personName(id: string) {
  return DEFAULT_PEOPLE.find((person) => person.id === id)?.name ?? 'Unassigned';
}

function toFormState(formula: Formula | undefined): FormState {
  if (!formula) {
    return {
      name: '',
      version: 'v1.0',
      category: '',
      ageGroup: '',
      targetMarkets: [],
      physicalForm: '',
      intendedUse: '',
      ownerId: '',
      reviewerId: '',
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
      grade: ingredient.grade ?? '',
      notes: ingredient.notes ?? '',
      batchId: ingredient.batchId ?? '',
      addedInVersion: ingredient.addedInVersion,
      compositionType: ingredient.compositionType || formulationMaterial(ingredient.rawMaterialId ?? '')?.materialType || '',
      casNumber: formulationMaterial(ingredient.rawMaterialId ?? '')?.casNumber ?? '',
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
        grade: row.grade || undefined,
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
    usStates: [],
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

  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [form, setForm] = useState<FormState>(() => toFormState(formula));
  const [uploads, setUploads] = useState<{ document_id: string; filename?: string; document_type?: string; processing_status?: string; evidence_status?: string; material_id?: string | null; extraction_status?: string }[]>([]);
  const [uploadError, setUploadError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('coa');
  const [rowDocTypes, setRowDocTypes] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | undefined>(undefined);
  const uploadType = useRef('coa');
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [substances, setSubstances] = useState<CatalogSubstance[]>([]);
  const [catalogNote, setCatalogNote] = useState('Catalog coverage incomplete.');
  const [catalogError, setCatalogError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setForm(toFormState(formula));
    setUploads([]);
    setUploadError(undefined);
    setStep(0);
    setFurthest(0);
    setShowAllIssues(false);
  }, [open, formula]);

  const screeningMarkets = form.targetMarkets.filter((market) => market === 'US' || market === 'EU');

  useEffect(() => {
    if (!open || !form.category || !form.ageGroup || screeningMarkets.length === 0) {
      setSubstances([]);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      regions: screeningMarkets.join(','),
      category: form.category,
      age_group: form.ageGroup,
    });
    setCatalogError(undefined);
    fetch(`/api/reference/substances?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((substanceBody) => {
        const nextSubstances = (substanceBody.substances ?? []) as CatalogSubstance[];
        setSubstances(nextSubstances);
        setCatalogNote(substanceBody.coverage_note || 'Catalog coverage incomplete.');
        const ids = new Set(nextSubstances.map((item) => item.substance_id));
        setForm((current) => ({
          ...current,
          ingredients: current.ingredients.map((row) => {
            if (!row.rawMaterialId) return row;
            const known = row.section === 'contaminant' ? undefined : formulationMaterial(row.rawMaterialId);
            const match = nextSubstances.find((item) => item.substance_id === row.rawMaterialId)
              ?? (known?.casNumber ? nextSubstances.find((item) => item.cas_number === known.casNumber) : undefined);
            return {
              ...row,
              rawMaterialId: match?.substance_id || row.rawMaterialId,
              name: known?.name || (match ? match.label.split(' — ')[0] : row.name),
              compositionType: match?.composition_types[0] || known?.materialType || row.compositionType,
              casNumber: known?.casNumber || match?.cas_number || row.casNumber,
              screeningRole: match?.role || (known ? 'formulation_ingredient' : row.screeningRole),
              needsCorrection: Boolean(match || known) ? false : !ids.has(row.rawMaterialId),
            };
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

  const uploadFiles = async (files: FileList | null, materialId?: string, documentType?: string) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(undefined);
    try {
      const saved: { document_id: string; filename?: string; document_type?: string; processing_status?: string; evidence_status?: string; material_id?: string | null; extraction_status?: string }[] = [];
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set('file', file);
        body.set('document_type', documentType || docType);
        body.set('scope', materialId ? 'material' : 'finished_product');
        if (materialId) body.set('material_id', materialId);
        if (formula?.id) body.set('formula_id', formula.id);
        if (form.version) body.set('version_id', form.version);
        body.set('regions', form.targetMarkets.filter((market) => market === 'US' || market === 'EU').join(','));
        const response = await fetch('/api/documents', { method: 'POST', body });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const detail = payload.detail;
          throw new Error(typeof detail === 'string' ? detail : 'The document was not saved.');
        }
        saved.push(payload);
      }
      setUploads((current) => [...saved, ...current]);
      setForm((current) => ({
        ...current,
        evidenceIds: Array.from(new Set([...current.evidenceIds, ...saved.map((item) => item.document_id as string)])),
      }));
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'The document was not saved.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

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
      width="xl"
      eyebrow={mode === 'edit' ? 'Edit formula' : 'New formula'}
      title={mode === 'edit' ? (formula?.name ?? 'Edit formula') : 'Create a formula'}
      subtitle="Drafts can be saved with missing fields and completed later."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            {validation.errors.length === 0 ? (
              <>
                <CheckCircle2 aria-hidden className="size-4 text-success" />
                Input can be saved. Evidence is reviewed during assessment.
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
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(event) => void uploadFiles(event.target.files, uploadTarget.current, uploadType.current)}
        />
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

              <Field label="Version" htmlFor="formula-version" hint="Saving an edit stores the next version, for example v1.0 becomes v1.1, unless you type a different one.">
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

              <Field label="Owner" htmlFor="formula-owner">
                <Select
                  id="formula-owner"
                  value={form.ownerId}
                  placeholder="Select an owner"
                  options={PEOPLE_OPTIONS}
                  onChange={(event) => update('ownerId', event.target.value)}
                />
              </Field>

              <Field label="Assigned reviewer" htmlFor="formula-reviewer">
                <Select
                  id="formula-reviewer"
                  value={form.reviewerId}
                  placeholder="Select a reviewer"
                  options={PEOPLE_OPTIONS}
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
            <Notice tone="warning" title="Selection list, not a recipe">
              Choose a substance from the dropdown. Material type and CAS fill in from that selection. You enter the concentration and can attach an SDS, CoA, laboratory report, or other file to that ingredient. {catalogNote} This list is not a Crayola recipe.
            </Notice>
            <Field label="Composition declaration">
              <Select
                value={form.compositionCompleteness}
                options={[
                  { value: 'partial', label: 'Partial formula — may be saved and assessed as incomplete' },
                  { value: 'complete', label: 'Complete list — must total 100% within ±0.01%' },
                ]}
                onChange={(event) => update('compositionCompleteness', event.target.value as 'partial' | 'complete')}
              />
            </Field>
            <p className="text-[13px] leading-6 text-muted">
              Narrower age bands and test-material categories are requested only when a rule needs them. State-specific rules stay in the source data and are excluded from this assessment.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted">
                {form.compositionCompleteness === 'partial'
                  ? 'Partial composition. Formulation percentages do not need to total 100%. Contaminant rows are excluded.'
                  : 'A declared complete list must total 100% within ±0.01 percentage points. Contaminant rows are excluded.'}
              </p>
              <Badge tone={form.compositionCompleteness === 'partial' || withinTolerance ? 'success' : 'warning'}>
                Formulation total {formatConcentration(total)}
              </Badge>
            </div>

            <div className="space-y-3">
              {form.ingredients.map((row, index) => {
                const rowErrors = validation.errors.filter((issue) => issue.ingredientIndex === index);
                const formulationOptions = formulationChoices(form.category, substances);
                const knownSelection = formulationMaterial(row.rawMaterialId);
                const selectedFormulation = choiceForId(row.rawMaterialId, formulationOptions)
                  ?? (knownSelection
                    ? {
                        id: knownSelection.id,
                        name: knownSelection.name,
                        casNumber: knownSelection.casNumber,
                        materialType: knownSelection.materialType,
                        role: 'formulation_ingredient',
                      }
                    : null);
                const substanceOptions = selectedFormulation && !formulationOptions.some((item) => item.id === selectedFormulation.id)
                  ? [selectedFormulation, ...formulationOptions]
                  : formulationOptions;
                const unmapped = row.section === 'contaminant'
                  ? Boolean(row.needsCorrection || (row.rawMaterialId && substances.length > 0 && !catalogIds.has(row.rawMaterialId)))
                  : Boolean(row.rawMaterialId && !selectedFormulation && !formulationMaterial(row.rawMaterialId));
                const analyteOptions = substances
                  .filter((item) => item.role !== 'formulation_ingredient')
                  .map((item) => ({ value: item.substance_id, label: item.label }));
                const linkedDocs = uploads.filter((item) => item.material_id === row.rawMaterialId && row.rawMaterialId);
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
                      <Field
                        label="Substance"
                        className="sm:col-span-12"
                        hint={row.section === 'contaminant'
                          ? 'Laboratory analytes for the selected category, age group, and US or EU market.'
                          : 'Common art-material substances for this product category. Material type and CAS fill in when you select one.'}
                      >
                        {row.section === 'contaminant' ? (
                          <Select
                            value={row.rawMaterialId}
                            placeholder={analyteOptions.length === 0 ? 'Set category, age, and US or EU to load analytes' : 'Select an analyte'}
                            options={analyteOptions}
                            invalid={unmapped}
                            onChange={(event) => {
                              const materialId = event.target.value;
                              const match = substances.find((item) => item.substance_id === materialId);
                              updateRow(row.key, {
                                rawMaterialId: materialId,
                                name: match ? match.label.split(' — ')[0] : row.name,
                                screeningRole: match?.role || 'contaminant_analyte',
                                compositionType: match?.composition_types[0] || '',
                                casNumber: match?.cas_number || '',
                                needsCorrection: false,
                              });
                            }}
                          />
                        ) : (
                          <Select
                            value={selectedFormulation?.id || row.rawMaterialId}
                            placeholder="Select a substance"
                            options={substanceOptions.map((item) => ({
                              value: item.id,
                              label: `${item.materialType} · ${item.name}${item.casNumber ? ` · ${item.casNumber}` : ''}`,
                            }))}
                            invalid={unmapped}
                            onChange={(event) => {
                              const materialId = event.target.value;
                              const match = choiceForId(materialId, substanceOptions);
                              updateRow(row.key, {
                                rawMaterialId: materialId,
                                name: match?.name || row.name,
                                screeningRole: match?.role || 'formulation_ingredient',
                                compositionType: match?.materialType || '',
                                casNumber: match?.casNumber || '',
                                needsCorrection: false,
                              });
                            }}
                          />
                        )}
                      </Field>
                      <Field label="Material type" className="sm:col-span-5" hint="Set automatically from the selected substance.">
                        <TextInput value={row.compositionType} readOnly placeholder="Select a substance" />
                      </Field>
                      <Field label="CAS number" className="sm:col-span-4" hint="Set automatically from the catalog.">
                        <TextInput value={row.casNumber} readOnly placeholder="Not listed" />
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

                      <Field label="Document for this ingredient" className="sm:col-span-4">
                        <Select
                          value={rowDocTypes[row.key] || 'coa'}
                          options={[
                            { value: 'sds', label: 'SDS' },
                            { value: 'coa', label: 'CoA' },
                            { value: 'lab_report', label: 'Laboratory report' },
                            { value: 'other', label: 'Other' },
                          ]}
                          onChange={(event) => setRowDocTypes((current) => ({ ...current, [row.key]: event.target.value }))}
                        />
                      </Field>
                      <div className="sm:col-span-8 flex flex-wrap items-end gap-2">
                        <Button
                          type="button"
                          onClick={() => {
                            uploadTarget.current = row.rawMaterialId;
                            uploadType.current = rowDocTypes[row.key] || 'coa';
                            fileInput.current?.click();
                          }}
                          disabled={!row.rawMaterialId || uploading}
                        >
                          Attach to this ingredient
                        </Button>
                        <p className="text-xs text-muted">A linked file is not verified evidence.</p>
                      </div>
                      {linkedDocs.length > 0 ? (
                        <ul className="sm:col-span-12 space-y-1">
                          {linkedDocs.map((item) => (
                            <li key={item.document_id} className="text-[13px] text-muted">
                              {item.filename || item.document_id} · {item.document_type}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[13px] font-medium text-brand-500">Supplier, grade, batch, and notes</summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label="Supplier">
                          <TextInput value={row.supplier} onChange={(event) => updateRow(row.key, { supplier: event.target.value })} placeholder="Optional" />
                        </Field>
                        <Field label="Grade">
                          <TextInput value={row.grade} onChange={(event) => updateRow(row.key, { grade: event.target.value })} placeholder="Optional" />
                        </Field>
                        <Field label="Batch">
                          <TextInput value={row.batchId} onChange={(event) => updateRow(row.key, { batchId: event.target.value })} placeholder="Optional" />
                        </Field>
                        <Field label="Notes">
                          <TextInput value={row.notes} onChange={(event) => updateRow(row.key, { notes: event.target.value })} placeholder="Optional" />
                        </Field>
                      </div>
                    </details>
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

            <div className="space-y-3 rounded-lg border border-line p-4">
              <div>
                <p className="text-sm font-medium text-ink">Upload documents</p>
                <p className="mt-1 text-[13px] leading-6 text-muted">
                  Upload SDS, CoA, laboratory reports, or other PDFs that apply to this formula. Ingredient files are attached on the ingredient row.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Document type">
                  <Select
                    value={docType}
                    options={[
                      { value: 'sds', label: 'SDS' },
                      { value: 'coa', label: 'CoA' },
                      { value: 'lab_report', label: 'Laboratory report' },
                      { value: 'label', label: 'Label / artwork' },
                      { value: 'other', label: 'Other' },
                    ]}
                    onChange={(event) => setDocType(event.target.value)}
                  />
                </Field>
              </div>
              <Button
                onClick={() => {
                  uploadTarget.current = undefined;
                  uploadType.current = docType;
                  fileInput.current?.click();
                }}
                loading={uploading}
              >
                Choose PDF files
              </Button>
              {uploadError ? <p className="text-sm text-danger">{uploadError}</p> : null}
              <ul className="space-y-2">
                {uploads.filter((item) => !item.material_id).map((item) => (
                  <li key={item.document_id} className="rounded-lg border border-line px-3 py-2 text-[13px] leading-6">
                    <p className="font-medium text-ink">{item.filename || item.document_id}</p>
                    <p className="text-muted">
                      {item.document_type} · processing {item.processing_status || item.extraction_status || 'processed'} · evidence {item.evidence_status || 'pending review'}
                    </p>
                    <button
                      type="button"
                      className="text-brand-500 hover:underline"
                      onClick={() => {
                        setUploads((current) => current.filter((row) => row.document_id !== item.document_id));
                        update('evidenceIds', form.evidenceIds.filter((id) => id !== item.document_id));
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
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
                  ['Owner', personName(form.ownerId)],
                  ['Reviewer', personName(form.reviewerId)],
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

            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Ingredients</p>
              {form.ingredients.filter((row) => row.name.trim() || row.rawMaterialId).map((row) => (
                <div key={row.key} className="rounded-lg border border-line px-3 py-2 text-[13px] leading-6">
                  <p className="font-medium text-ink">{row.name || 'Unnamed ingredient'}</p>
                  <p className="text-muted">
                    {row.compositionType || 'Material type not set'} · CAS {row.casNumber || 'not listed'} · {row.section === 'contaminant' ? `Result ${row.measuredText || '—'} ${row.measuredUnit}` : `${row.concentrationText || '—'}%`}
                  </p>
                  <p className="text-muted">
                    {uploads.filter((item) => item.material_id === row.rawMaterialId && row.rawMaterialId).length} document{uploads.filter((item) => item.material_id === row.rawMaterialId && row.rawMaterialId).length === 1 ? '' : 's'} attached to this ingredient
                  </p>
                </div>
              ))}
            </div>

            {validation.errors.length > 0 ? (
              <Notice tone="warning" title="Input is incomplete">
                {validation.missingFieldLabels.join(', ') || 'Fix the items above'}. You can still save a draft. Saving does not run an assessment.
              </Notice>
            ) : form.evidenceIds.length === 0 ? (
              <Notice tone="warning" title="Input can be saved. Evidence is not sufficient.">
                No documents are linked. An assessment can still run and will treat the missing documents as uncertainty. Saving does not complete an assessment.
              </Notice>
            ) : (
              <Notice tone="success" title="Input is complete">
                Documents are linked and still need processing and review. A processed file is not verified evidence, and this save does not run an assessment.
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
