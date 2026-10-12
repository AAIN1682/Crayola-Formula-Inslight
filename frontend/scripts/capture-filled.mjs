import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('../docs/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/screening/new', { waitUntil: 'networkidle' });
await page.getByText(/^Product name/).locator('..').locator('input').fill('Washable Neon Marker');
await page.getByText(/^Formula code/).locator('..').locator('input').fill('FX-2291');
await page.locator('input[inputmode="decimal"]').first().fill('73.388');
await page.screenshot({ path: '../docs/screenshots/new-screening-filled-partial-total.png', fullPage: true });
await browser.close();
