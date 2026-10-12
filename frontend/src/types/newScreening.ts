import type { AgeGroup, ProductCategory, TargetMarket } from './domain';

export interface CompositionRow {
  key: string;
  catalogId?: string;
  custom: boolean;
  name: string;
  cas: string;
  functionLabel: string;
  pct: string;
  supplier: string;
  sdsAvailable: boolean;
  coaAvailable: boolean;
  documentIds: string[];
  screeningRole?: 'formulation_ingredient' | 'contaminant_analyte' | 'role_requires_review';
}

export interface UploadedFileRow {
  id: string;
  name: string;
  kind: 'pdf' | 'xlsx' | 'other';
  documentType: 'sds' | 'coa' | 'lab_report' | 'acmi_template' | 'other';
  documentId?: string;
  linkedIngredientKey?: string;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
}

export interface NewScreeningDraft {
  formulaId?: string;
  name: string;
  formulaCode: string;
  category: ProductCategory;
  physicalForm: string;
  ageGrade: string;
  ageGroup: AgeGroup;
  productColor: string;
  intendedUse: string;
  targetMarkets: TargetMarket[];
  ingredients: CompositionRow[];
  files: UploadedFileRow[];
}

export const AGE_GRADE_OPTIONS = ['2+', '3+', '4+', '5+', '6+', '8+', '12+'] as const;

export function ageGroupForGrade(grade: string): AgeGroup {
  return grade === '12+' ? '12_and_above' : 'under_12';
}

export function emptyCompositionRow(): CompositionRow {
  return {
    key: `row-${crypto.randomUUID()}`,
    custom: false,
    name: '',
    cas: '',
    functionLabel: '',
    pct: '',
    supplier: '',
    sdsAvailable: false,
    coaAvailable: false,
    documentIds: [],
  };
}

export function defaultDraft(): NewScreeningDraft {
  return {
    name: '',
    formulaCode: '',
    category: 'Markers',
    physicalForm: '',
    ageGrade: '3+',
    ageGroup: 'under_12',
    productColor: '#3B82F6',
    intendedUse: '',
    targetMarkets: [],
    ingredients: [emptyCompositionRow()],
    files: [],
  };
}

export const DRAFT_STORAGE_KEY = 'preseal-new-screening-draft-v1';
