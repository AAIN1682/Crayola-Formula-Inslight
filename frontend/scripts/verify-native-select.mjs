import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../docs/screenshots');
const BASE = 'http://localhost:5173';

const BANNED = [
  'Not in rule catalog',
  'needs exactly 100%',
  'Missing',
  'needs a % greater than 0',
  'Ready to screen',
];

async function pickByLabel(page, rowIndex, label) {
  await page.locator(`#ps-ing-${rowIndex}-id`).selectOption({ label });
}

async function run(width, tag) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 768 } });
  await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle', timeout: 60000 });

  const select = page.locator('#ps-ing-0-id');
  await select.click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `native-select-open-${tag}.png`) });

  await pickByLabel(page, 0, 'Acid Yellow 23 / Tartrazine');
  const cas = await page.locator('tbody tr').first().locator('.ps-cas').textContent();
  await page.screenshot({ path: path.join(outDir, `native-select-tartrazine-${tag}.png`) });

  await pickByLabel(page, 0, 'Use custom ingredient…');
  const customInput = page.locator('tbody tr').first().locator('input[aria-label="Custom ingredient name"]');
  await customInput.waitFor();
  await page.getByRole('button', { name: 'Back to list' }).click();
  await select.waitFor();

  await page.getByLabel('Product name').fill('Example verify');
  await page.locator('label.ps-mkt input').first().check();
  await pickByLabel(page, 0, 'Water');
  await page.locator('tbody tr').nth(0).locator('input[type="number"]').fill('78.5');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /add ingredient/i }).click();
  await pickByLabel(page, 1, 'Glycerin');
  await page.locator('tbody tr').nth(1).locator('input[type="number"]').fill('12');
  await pickByLabel(page, 2, 'Acid Yellow 23 / Tartrazine');
  await page.locator('tbody tr').nth(2).locator('input[type="number"]').fill('8.5');
  await pickByLabel(page, 3, 'Sodium benzoate');
  await page.locator('tbody tr').nth(3).locator('input[type="number"]').fill('0.5');
  await page.getByRole('button', { name: 'Rebalance' }).click();
  const total = await page.locator('.ps-total .ps-mono').textContent();
  const runEnabled = await page.getByRole('button', { name: 'Run pre-check' }).isEnabled();
  await page.screenshot({ path: path.join(outDir, `composition-valid-${tag}.png`), fullPage: false });

  await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle' });
  const bodyText = await page.locator('.ps-screening').innerText();
  const domHtml = await page.locator('.ps-screening').innerHTML();
  const bannedFound = BANNED.filter((s) => bodyText.includes(s) || domHtml.includes(s));
  const runTitle = await page.getByRole('button', { name: 'Run pre-check' }).getAttribute('title');
  const saveEnabled = await page.getByRole('button', { name: 'Save draft' }).isEnabled();
  await page.screenshot({ path: path.join(outDir, `actionbar-incomplete-${tag}.png`, fullPage: false });

  console.log(
    JSON.stringify(
      {
        viewport: width,
        tartrazineCas: cas?.trim(),
        totalAfterRebalance: total?.trim(),
        runEnabled,
        bannedFound,
        runTitle,
        saveEnabledIncomplete: saveEnabled,
      },
      null,
      2,
    ),
  );

  await browser.close();
}

await mkdir(outDir, { recursive: true });
await run(1366, '1366');
await run(900, '900');
