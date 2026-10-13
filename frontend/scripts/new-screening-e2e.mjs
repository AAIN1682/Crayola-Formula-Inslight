import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8000';

async function fillValidForm(page) {
  await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#ps-product-name', 'E2E Washable Marker');
  await page.locator('label.ps-mkt').filter({ hasText: 'United States' }).click();
  await page.waitForFunction(() => !document.querySelector('#ing-0-id')?.hasAttribute('disabled'), null, {
    timeout: 60000,
  });

  for (let i = 0; i < 4; i++) {
    if (i > 0) await page.getByRole('button', { name: '+ Add ingredient' }).click();
    const sel = page.locator('table.ps-tbl.comp select.ps-in').nth(i);
    const options = await sel.locator('option').all();
    const pick = options[Math.min(i + 3, options.length - 1)];
    const val = pick ? await pick.getAttribute('value') : null;
    if (val && val !== '__custom__') await sel.selectOption(val);
    await page.locator('table.ps-tbl.comp input.ps-in.num').nth(i).fill('1');
  }
  await page.getByRole('button', { name: 'Rebalance' }).click();
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await fillValidForm(page);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForTimeout(2000);
  assert.match(await page.content(), /Draft saved|E2E Washable Marker/);

  await page.goto(`${BASE}/formulas?q=E2E+Washable`, { waitUntil: 'networkidle' });
  assert.match(await page.content(), /E2E Washable Marker/);

  await fillValidForm(page);
  const blockers = await page.locator('.ps-actionbar p[role="status"]').textContent().catch(() => '');
  assert.equal(blockers?.trim() ?? '', '', `Run blockers: ${blockers}`);
  await page.getByRole('button', { name: 'Run pre-check' }).click();
  await page.waitForURL(/\/formulas\/FML-\d+\/results\//, { timeout: 120000 });

  await page.route(`${API}/api/formulas`, (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Service unavailable' }) }),
  );
  await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle' });
  await page.fill('#ps-product-name', 'E2E API fail');
  await page.locator('label.ps-mkt').filter({ hasText: 'United States' }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForTimeout(1500);
  const err = await page.locator('.ps-toast, [role="alert"], .ps-actionbar').first().textContent().catch(() => '');
  assert.match(err ?? page.content(), /unavailable|could not|failed|retry|error/i);

  await browser.close();
  console.log('E2E new screening: passed (happy path + API failure)');
}

main().catch((error) => {
  console.error('E2E new screening: FAILED', error);
  process.exit(1);
});
