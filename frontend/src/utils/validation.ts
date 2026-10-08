import type { FormulaInput } from '../types/services';

/** Concentrations must add up to 100%, with an explicit rounding tolerance. */
export const CONCENTRATION_TOTAL = 100;
export const CONCENTRATION_TOLERANCE = 0.5;
export const MIN_INGREDIENT_CONCENTRATION = 0.001;
export const MAX_INGREDIENT_CONCENTRATION = 100;

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  field: string;
  message: string;
  severity: IssueSeverity;
  /** Step of the New Formula flow the issue belongs to (1-indexed). */
  step: 1 | 2 | 3;
  ingredientIndex?: number;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** True when the formula can be saved as a complete (non-draft) record. */
  isComplete: boolean;
  total: number;
  totalWithinTolerance: boolean;
  missingFieldLabels: string[];
}

export function sumConcentrations(ingredients: { concentration: number }[]): number {
  const total = ingredients.reduce(
    (acc, ingredient) => acc + (Number.isFinite(ingredient.concentration) ? ingredient.concentration : 0),
    0,
  );
  // Guard against binary floating point drift (0.1 + 0.2 style artefacts).
  return Math.round(total * 1000) / 1000;
}

export function isTotalWithinTolerance(total: number): boolean {
  return Math.abs(total - CONCENTRATION_TOTAL) <= CONCENTRATION_TOLERANCE + 1e-9;
}

export function validateFormulaInput(input: FormulaInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const missingFieldLabels: string[] = [];

  const requireText = (
    value: string | undefined,
    field: string,
    label: string,
    step: 1 | 2 | 3,
    minLength = 1,
  ) => {
    const trimmed = (value ?? '').trim();
    if (trimmed.length < minLength) {
      issues.push({
        field,
        step,
        severity: 'error',
        message:
          minLength > 1
            ? `${label} is required and must be at least ${minLength} characters.`
            : `${label} is required.`,
      });
      missingFieldLabels.push(label);
    }
  };

  requireText(input.name, 'name', 'Formula name', 1, 3);
  if (!input.category) {
    issues.push({ field: 'category', step: 1, severity: 'error', message: 'Product category is required.' });
    missingFieldLabels.push('Product category');
  }
  if (!input.ageGroup) {
    issues.push({ field: 'ageGroup', step: 1, severity: 'error', message: 'Intended age group is required.' });
    missingFieldLabels.push('Intended age group');
  }
  if (!input.targetMarkets || input.targetMarkets.length === 0) {
    issues.push({
      field: 'targetMarkets',
      step: 1,
      severity: 'error',
      message: 'Select at least one target market before assessment.',
    });
    missingFieldLabels.push('Target markets');
  }
  if (!input.physicalForm) {
    issues.push({ field: 'physicalForm', step: 1, severity: 'error', message: 'Physical form is required.' });
    missingFieldLabels.push('Physical form');
  }
  requireText(input.ownerId, 'ownerId', 'Owner', 1);
  requireText(input.intendedUse, 'intendedUse', 'Intended use', 3, 10);

  if (input.ingredients.length === 0) {
    issues.push({
      field: 'ingredients',
      step: 2,
      severity: 'error',
      message: 'Add at least one ingredient row.',
    });
    missingFieldLabels.push('Ingredients');
  }

  const seenNames = new Map<string, number>();
  const seenMaterials = new Set<string>();

  input.ingredients.forEach((ingredient, index) => {
    const name = ingredient.name.trim();
    if (!name) {
      issues.push({
        field: `ingredients.${index}.name`,
        step: 2,
        severity: 'error',
        message: `Row ${index + 1}: ingredient name is required.`,
        ingredientIndex: index,
      });
    } else {
      const key = name.toLowerCase();
      const previous = seenNames.get(key);
      if (previous !== undefined) {
        issues.push({
          field: `ingredients.${index}.name`,
          step: 2,
          severity: 'warning',
          message: `Row ${index + 1}: "${name}" is already listed in row ${previous + 1}.`,
          ingredientIndex: index,
        });
      } else {
        seenNames.set(key, index);
      }
    }

    const concentration = ingredient.concentration;
    if (!Number.isFinite(concentration)) {
      issues.push({
        field: `ingredients.${index}.concentration`,
        step: 2,
        severity: 'error',
        message: `Row ${index + 1}: enter a concentration as a number.`,
        ingredientIndex: index,
      });
    } else if (concentration < MIN_INGREDIENT_CONCENTRATION) {
      issues.push({
        field: `ingredients.${index}.concentration`,
        step: 2,
        severity: 'error',
        message: `Row ${index + 1}: concentration must be greater than ${MIN_INGREDIENT_CONCENTRATION}%.`,
        ingredientIndex: index,
      });
    } else if (concentration > MAX_INGREDIENT_CONCENTRATION) {
      issues.push({
        field: `ingredients.${index}.concentration`,
        step: 2,
        severity: 'error',
        message: `Row ${index + 1}: concentration cannot exceed ${MAX_INGREDIENT_CONCENTRATION}%.`,
        ingredientIndex: index,
      });
    }

    if (ingredient.rawMaterialId) {
      if (seenMaterials.has(ingredient.rawMaterialId)) {
        issues.push({
          field: `ingredients.${index}.rawMaterialId`,
          step: 2,
          severity: 'error',
          message: `Row ${index + 1}: ${ingredient.rawMaterialId} is already in the formula. Combine the rows.`,
          ingredientIndex: index,
        });
      }
      seenMaterials.add(ingredient.rawMaterialId);
    }

    if (!ingredient.rawMaterialId) {
      issues.push({
        field: `ingredients.${index}.rawMaterialId`,
        step: 2,
        severity: 'warning',
        message: `Row ${index + 1}: no raw-material reference selected — the record stays incomplete.`,
        ingredientIndex: index,
      });
    }

    if (!ingredient.supplier?.trim()) {
      issues.push({
        field: `ingredients.${index}.supplier`,
        step: 2,
        severity: 'warning',
        message: `Row ${index + 1}: supplier is not recorded.`,
        ingredientIndex: index,
      });
    }
  });

  const total = sumConcentrations(input.ingredients);
  const packageCatalog =
    input.ingredients.length > 0 &&
    input.ingredients.every((ingredient) => Boolean(ingredient.rawMaterialId && /^[a-z][a-z0-9_]*$/.test(ingredient.rawMaterialId)));
  const tolerance = packageCatalog ? 0.01 : CONCENTRATION_TOLERANCE;
  const totalWithinTolerance = Math.abs(total - CONCENTRATION_TOTAL) <= tolerance + 1e-9;

  if (input.ingredients.length > 0 && !totalWithinTolerance) {
    issues.push({
      field: 'ingredients.total',
      step: 2,
      severity: 'error',
      message: `Concentrations total ${total}%. They must reach ${CONCENTRATION_TOTAL}% within ±${tolerance}%.`,
    });
    missingFieldLabels.push('Balanced composition');
  }

  if (input.evidenceIds.length === 0) {
    issues.push({
      field: 'evidenceIds',
      step: 3,
      severity: 'warning',
      message: 'No formula-level evidence is linked yet. Screening will report this as a gap.',
    });
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return {
    issues,
    errors,
    warnings,
    isComplete: errors.length === 0,
    total,
    totalWithinTolerance,
    missingFieldLabels: Array.from(new Set(missingFieldLabels)),
  };
}

export function issuesForStep(result: ValidationResult, step: 1 | 2 | 3): ValidationIssue[] {
  return result.issues.filter((issue) => issue.step === step);
}

export function fieldError(result: ValidationResult, field: string): string | undefined {
  return result.errors.find((issue) => issue.field === field)?.message;
}
