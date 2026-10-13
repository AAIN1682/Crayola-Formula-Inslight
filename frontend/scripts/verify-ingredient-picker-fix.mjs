import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../docs/screenshots');
const BASE = 'http://localhost:5173';

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(500);

const combobox = page.getByRole('combobox', { name: 'Ingredient' }).first();
await combobox.click();
await page.waitForTimeout(200);
const listCount = await page.locator('.ps-combobox-list button').count();
await page.screenshot({ path: path.join(outDir, 'picker-full-list-open.png') });

await combobox.fill('tart');
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(outDir, 'picker-filter-tart.png') });
await page.locator('.ps-combobox-list button').filter({ hasText: 'Tartrazine' }).first().click();
await page.waitForTimeout(200);
const row0Name = await combobox.inputValue();
const casText = await page.locator('tbody tr').first().locator('.ps-cas').textContent();
const fnText = await page.locator('tbody tr').first().locator('.ps-fn').textContent();
await page.screenshot({ path: path.join(outDir, 'picker-tartrazine-selected.png') });

await combobox.click();
await combobox.fill('zzz');
await page.waitForTimeout(150);
const noMatchVisible = await page.getByText('No match. Use custom ingredient').isVisible();
const stillCatalog = !(await page.locator('tbody tr').first().locator('input[aria-label="Custom ingredient name"]').count());
await page.screenshot({ path: path.join(outDir, 'picker-no-match-zzz.png') });

// Example 1 composition via dropdown
async function pickIngredient(rowIndex, search, optionName) {
  const box = page.getByRole('combobox', { name: 'Ingredient' }).nth(rowIndex);
  await box.click();
  await box.fill(search);
  await page.waitForTimeout(100);
  await page.locator('.ps-combobox-list button').filter({ hasText: optionName }).first().click();
}

await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle' });
await page.getByLabel('Product name').fill('Picker verify example');
await page.locator('label.ps-mkt input').first().check();

await pickIngredient(0, 'water', 'Water');
await page.locator('tbody tr').nth(0).locator('input[type="number"]').fill('78.5');

for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: /add ingredient/i }).click();
}
await pickIngredient(1, 'glycerin', 'Glycerin');
await page.locator('tbody tr').nth(1).locator('input[type="number"]').fill('12');
await pickIngredient(2, 'tartrazine', 'Tartrazine');
await page.locator('tbody tr').nth(2).locator('input[type="number"]').fill('8.5');
await pickIngredient(3, 'sodium benzoate', 'Sodium benzoate');
await page.locator('tbody tr').nth(3).locator('input[type="number"]').fill('0.5');

const totalText = await page.locator('.ps-total .ps-mono').textContent();
const runBtn = page.getByRole('button', { name: /run pre-check/i });
const runEnabled = await runBtn.isEnabled();

console.log(
  JSON.stringify(
    {
      listCountOnOpen: listCount,
      tartrazine: { row0Name, casText: casText?.trim(), fnText: fnText?.trim() },
      noMatch: { noMatchVisible, stillCatalog },
      example1: { totalText: totalText?.trim(), runEnabled },
    },
    null,
    2,
  ),
);

await browser.close();
