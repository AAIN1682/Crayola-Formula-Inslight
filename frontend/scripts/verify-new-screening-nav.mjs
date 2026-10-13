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

await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, 'overview-before-new-screening-click.png'), fullPage: false });

const headerLink = page.getByRole('link', { name: 'New screening' }).first();
await headerLink.click();
await page.waitForURL('**/screening/new', { timeout: 15000 });
await page.waitForTimeout(400);

const url = page.url();
const drawerVisible = await page.getByRole('heading', { name: 'Create a formula' }).isVisible().catch(() => false);
const onNewPage = url.includes('/screening/new');

await page.screenshot({ path: path.join(outDir, 'overview-after-new-screening-click.png'), fullPage: false });

console.log(JSON.stringify({ url, onNewPage, drawerVisible, ok: onNewPage && !drawerVisible }, null, 2));

if (!onNewPage || drawerVisible) {
  process.exitCode = 1;
}

await page.goto(`${BASE}/formulas`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: 'New screening' }).first().click();
await page.waitForURL('**/screening/new');
console.log('formula_library_ok', page.url().includes('/screening/new'));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.locator('nav a[href="/screening/new"]').click();
await page.waitForURL('**/screening/new');
console.log('sidebar_ok', page.url().includes('/screening/new'));

await browser.close();
