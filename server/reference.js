import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

export const REFERENCE_DATA_VERSION = '1.0.0';

const CATEGORIES = new Set([
  'water_based_marker_ink',
  'wax_crayon',
  'water_based_poster_paint',
  'air_dry_modeling_compound',
  'water_based_craft_adhesive',
]);

function readJson(name) {
  return JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
}

function validateRules(rules) {
  for (const rule of rules) {
    const min = rule.minimum_pct;
    const max = rule.maximum_pct;
    const numeric = Number.isFinite(min) && Number.isFinite(max);
    if (!numeric || min < 0 || max > 100 || min > max) {
      throw new Error(`Reference rule ${rule.rule_id ?? '(missing id)'} has an invalid concentration range.`);
    }
    if (!CATEGORIES.has(rule.product_category)) {
      throw new Error(`Reference rule ${rule.rule_id} uses an unsupported product category.`);
    }
    if (rule.is_regulatory_limit === true) {
      throw new Error(`Reference rule ${rule.rule_id} must stay marked as an illustrative criterion.`);
    }
  }
}

let cached;

export function loadReference() {
  if (cached) return cached;
  const ingredients = readJson('ingredients.json');
  const rules = readJson('rules.json');
  const evidenceRequirements = readJson('evidence_requirements.json');
  const documents = readJson('documents.json');
  const historicalCases = readJson('historical_cases.json');
  const examplesFile = readJson('example_formulas.json');
  validateRules(rules);
  cached = {
    version: REFERENCE_DATA_VERSION,
    ingredients,
    rules,
    evidenceRequirements,
    documents,
    historicalCases,
    examples: examplesFile.formulas,
    examplesNote: examplesFile.note,
  };
  return cached;
}

export function resetReferenceCache() {
  cached = undefined;
}
