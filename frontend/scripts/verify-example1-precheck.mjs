import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../docs/screenshots');
const BASE = 'http://localhost:5173';

async function pickByLabel(page, rowIndex, label) {
  await page.locator(`#ing-${rowIndex}-id`).selectOption({ label });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  let assessmentBody = null;
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/api\/formulas\/FML-\d+\/assessments$/.test(req.url())) {
      try {
        assessmentBody = JSON.parse(req.postData() || '{}');
      } catch {
        assessmentBody = req.postData();
      }
    }
  });

  await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle', timeout: 90000 });

  await page.fill(
    '#ps-product-name',
    'Crayola Washable Liquid Watercolor (Sunburst Yellow Base)',
  );
  await page.selectOption('#ps-category', { label: 'Paints' });
  await page.fill('#ps-physical-form', 'Liquid');
  await page.selectOption('#ps-age-grade', { label: 'Ages 3+' });
  await page.locator('label.ps-mkt').filter({ hasText: 'United States' }).locator('input').check();
  await page.fill(
    '#ps-intended-use',
    'Washable liquid watercolor for creative play; applied to paper with brush.',
  );

  await page.locator('#ing-0-id').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#ing-0-id')?.hasAttribute('disabled'), null, {
    timeout: 60000,
  });

  await pickByLabel(page, 0, 'Water');
  await page.locator('tbody tr').nth(0).locator('input[type="number"]').fill('78.5');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /add ingredient/i }).click();
  await pickByLabel(page, 1, 'Glycerin');
  await page.locator('tbody tr').nth(1).locator('input[type="number"]').fill('12.5');
  await pickByLabel(page, 2, 'Acid Yellow 23 / Tartrazine');
  await page.locator('tbody tr').nth(2).locator('input[type="number"]').fill('8.5');
  await pickByLabel(page, 3, 'Sodium Benzoate');
  await page.locator('tbody tr').nth(3).locator('input[type="number"]').fill('0.5');

  const bannerBefore = await page.locator('.ps-run-error').textContent().catch(() => '');
  const runEnabled = await page.getByRole('button', { name: 'Run pre-check' }).isEnabled();

  await page.getByRole('button', { name: 'Run pre-check' }).click();
  await page.waitForURL(/\/formulas\/FML-\d+\/results\//, { timeout: 180000 });

  const bannerAfterNav = await page.locator('.ps-run-error').count();
  await page.waitForTimeout(1500);
  const screenshotPath = path.join(outDir, 'example1-result-page.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const summary = await page.locator('main').innerText();
  const report = {
    runEnabledBeforeRun: runEnabled,
    redBannerBeforeRun: bannerBefore?.trim() || null,
    redBannerOnResultPage: bannerAfterNav,
    assessmentRequestBody: assessmentBody,
    resultPageExcerpt: summary.slice(0, 4000),
    screenshotPath,
  };

  await writeFile(path.join(outDir, 'example1-precheck-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
