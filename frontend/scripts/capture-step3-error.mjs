import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('../docs/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/api/formulas**', async (route) => {
  if (route.request().method() === 'POST' && route.request().url().includes('/assessments')) {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Assessment service unavailable.' }),
    });
    return;
  }
  await route.continue();
});
await page.goto('http://localhost:5173/screening/new', { waitUntil: 'networkidle' });
await page.getByText(/^Product name/).locator('..').locator('input').fill('Error path marker');
await page.getByText(/^Intended use/).locator('..').locator('textarea').fill('Test.');
await page.locator('input[inputmode="decimal"]').first().fill('100');
await page.getByRole('button', { name: 'Run pre-check' }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: '../docs/screenshots/new-screening-step3-error.png', fullPage: true });
await browser.close();
console.log('step3 error captured');
