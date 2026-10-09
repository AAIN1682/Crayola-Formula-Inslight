/**
 * One-shot export of the demo seed into backend/datanew JSON files.
 * Run: npm run export-workspace  (from frontend/)
 */
import { mkdirSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeedDataset } from '../src/data/seed';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', 'datanew');
const seedDir = join(root, '_seed');

mkdirSync(seedDir, { recursive: true });

const dataset = createSeedDataset();
const latest: Record<string, string> = {};
for (const formula of dataset.formulas) {
  if (formula.latestRunId) latest[formula.id] = formula.latestRunId;
}

const files: Record<string, unknown> = {
  manifest: { dataset_version: '1.0.0', purpose: 'Formula Insight workspace store', source: 'frontend seed export' },
  people: dataset.people,
  formulas: dataset.formulas,
  raw_materials: dataset.rawMaterials,
  documents: dataset.documents,
  submissions: dataset.submissions,
  alerts: dataset.alerts,
  decisions: dataset.decisions,
  activities: dataset.activities,
  settings: dataset.settings,
  source_review_drafts: dataset.sourceReviewDrafts ?? [],
  assessment_runs: { runs: dataset.runs, latest },
};

for (const [name, payload] of Object.entries(files)) {
  const filename = name === 'manifest' ? 'manifest.json' : `${name}.json`;
  const text = JSON.stringify(payload, null, 2);
  writeFileSync(join(root, filename), text, 'utf8');
  writeFileSync(join(seedDir, filename), text, 'utf8');
}

if (!existsSync(join(root, 'user_uploads'))) {
  mkdirSync(join(root, 'user_uploads'), { recursive: true });
}

console.log(`Exported workspace to ${root}`);
