import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../docs/screenshots');
const BASE = 'http://localhost:5173';

await mkdir(outDir, { recursive: true });

async function runViewport(width, suffix) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 768 } });
  await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle', timeout: 60000 });

  const combobox = page.getByRole('combobox', { name: 'Ingredient' }).first();
  await combobox.click();
  await page.waitForTimeout(300);

  const portal = page.locator('.ps-ingredient-dropdown-portal');
  const visibleRows = await portal.locator('.ps-ingredient-dropdown-row').count();
  const portalBox = await portal.boundingBox();
  const tableWrapScroll = await page.locator('.ps-tbl-wrap').evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTop: el.scrollTop,
  }));
  const tagInDom = await page.locator('text=Not in rule catalog').count();
  const sampleRow = await portal.locator('.ps-ingredient-dropdown-row').first();
  const nameBox = await sampleRow.locator('.ps-ingredient-dropdown-name').boundingBox();
  const casBox = await sampleRow.locator('.ps-ingredient-dropdown-cas').boundingBox();
  const separated = nameBox && casBox ? casBox.x >= nameBox.x + nameBox.width - 4 : false;

  await page.screenshot({ path: path.join(outDir, `picker-portal-row1-${suffix}.png`) });

  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /add ingredient/i }).click();
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const lastCombo = page.getByRole('combobox', { name: 'Ingredient' }).last();
  await lastCombo.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `picker-portal-last-row-${suffix}.png`) });

  await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle' });
  await combobox.click();
  await combobox.fill('tart');
  await page.waitForTimeout(150);
  await page.locator('.ps-ingredient-dropdown-row').filter({ hasText: 'Tartrazine' }).first().click();
  const casText = await page.locator('tbody tr').first().locator('.ps-cas').textContent();
  const fnText = await page.locator('tbody tr').first().locator('.ps-fn').textContent();

  console.log(
    JSON.stringify(
      {
        viewport: width,
        visibleRowsInPortal: visibleRows,
        portalHeight: portalBox?.height,
        tableWrapHasVerticalScroll: tableWrapScroll.scrollHeight > tableWrapScroll.clientHeight + 2,
        tagInDom,
        nameCasSeparated: separated,
        tartrazine: { casText: casText?.trim(), fnText: fnText?.trim() },
      },
      null,
      2,
    ),
  );

  await browser.close();
}

await runViewport(1366, '1366');
await runViewport(900, '900');
