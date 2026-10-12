import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'screenshots');
mkdirSync(outDir, { recursive: true });

const base = process.env.APP_URL || 'http://localhost:5173';
const step = process.argv[2] || 'step1';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

if (step === 'step1') {
  await page.goto(`${base}/screening/new`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(outDir, 'new-screening-step1.png'), fullPage: true });
}

if (step === 'step3-running') {
  await page.goto(`${base}/screening/new`, { waitUntil: 'networkidle' });
  await page.getByLabel(/^Product name/).fill('Browser test marker');
  await page.getByLabel(/^Formula code/).fill('TST-001');
  await page.getByLabel(/^Physical form/).fill('Liquid');
  await page.getByLabel(/^Intended use/).fill('Classroom marker on paper.');
  const pct = page.locator('input[inputmode="decimal"]').first();
  await pct.fill('100');
  await page.getByRole('button', { name: 'Run pre-check' }).click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(outDir, 'new-screening-step3-running.png'), fullPage: true });
}

if (step === 'step3-error') {
  await page.goto(`${base}/screening/new`, { waitUntil: 'networkidle' });
  await page.route('**/api/formulas/*/assessments', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Assessment unavailable in test.' }) }),
  );
  await page.getByLabel(/^Product name/).fill('Error path marker');
  await page.locator('input[inputmode="decimal"]').first().fill('100');
  await page.getByRole('button', { name: 'Run pre-check' }).click({ force: true });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(outDir, 'new-screening-step3-error.png'), fullPage: true });
}

if (step === 'step6') {
  await page.goto(`${base}/screening/new`, { waitUntil: 'networkidle' });
  await page.getByLabel(/^Start from/).selectOption({ index: 0 });
  await page.screenshot({ path: join(outDir, 'new-screening-step6.png'), fullPage: true });
}

await browser.close();
console.log(`Saved screenshot for ${step} to ${outDir}`);
