import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5173';
const OUT = new URL('../../docs/screenshots/', import.meta.url);

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${BASE}/formulas`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: new URL('formulas-library-all.png', OUT), fullPage: true });
  await page.locator('button[aria-label^="Actions for"]').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: new URL('formulas-library-row-menu.png', OUT), fullPage: true });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
