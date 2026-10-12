import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('../docs/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/api/formulas/*/assessments', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 3500));
  await route.continue();
});
await page.goto('http://localhost:5173/screening/new', { waitUntil: 'networkidle' });
await page.getByText(/^Product name/).locator('..').locator('input').fill('Electric Pink Marker');
await page.getByText(/^Intended use/).locator('..').locator('textarea').fill('Washable marker for paper.');
const ingredientSelect = page.locator('table select').first();
await ingredientSelect.selectOption('__custom__');
await page.getByPlaceholder('Custom ingredient name').fill('Water');
await page.locator('input[inputmode="decimal"]').first().fill('100');
await page.getByRole('button', { name: 'Run pre-check' }).click();
await page.waitForSelector('text=Running pre-check', { timeout: 5000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '../docs/screenshots/new-screening-step3-running.png', fullPage: true });
await browser.close();
console.log('step3 running captured');
