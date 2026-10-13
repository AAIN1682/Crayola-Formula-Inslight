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

const searches = ['tartrazine', '1934', 'copper', '7440-50-8', 'borax', 'gypsum', 'starch'];
const combobox = page.getByRole('combobox', { name: 'Ingredient' }).first();
const searchResults = {};

for (const term of searches) {
  await combobox.click();
  await combobox.fill(term);
  await page.waitForTimeout(300);
  const list = page.locator('.ps-combobox-list');
  const visible = await list.isVisible();
  const count = visible ? await list.locator('button').count() : 0;
  searchResults[term] = count > 0;
}

await combobox.click();
await combobox.fill('tartrazine');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, 'screening-picker-search-tartrazine.png') });

const color = page.locator('#f-swatch');
await color.evaluate((el) => {
  el.value = '#ff3ea5';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(200);
const hex = await page.locator('#f-swatch-hex').textContent();
const swatchBg = await page.locator('.ps-title .ps-sw').evaluate((el) => getComputedStyle(el).backgroundColor);
await page.screenshot({ path: path.join(outDir, 'screening-product-color-box.png') });

console.log(JSON.stringify({ searchResults, hex, swatchBg }, null, 2));

const failed = Object.entries(searchResults).filter(([, ok]) => !ok);
if (failed.length) process.exitCode = 1;

await browser.close();
