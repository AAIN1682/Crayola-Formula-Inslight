import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../docs/screenshots');
const proto = path.resolve(__dirname, '../../../preseal-prototype.html');

async function snap(page, name) {
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
}

async function capture(url, prefix, viewport) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await snap(page, `${prefix}-top-${viewport.width}.png`);
  const comp = page.locator('.ps-tbl.comp, table.comp').first();
  if (await comp.count()) {
    await comp.scrollIntoViewIfNeeded();
    await snap(page, `${prefix}-composition-${viewport.width}.png`);
  }
  const drop = page.locator('.ps-drop, label.drop').first();
  if (await drop.count()) {
    await drop.scrollIntoViewIfNeeded();
    await snap(page, `${prefix}-files-${viewport.width}.png`);
  }
  const bar = page.locator('.ps-actionbar, .actionbar').first();
  if (await bar.count()) {
    await bar.scrollIntoViewIfNeeded();
    await snap(page, `${prefix}-actionbar-${viewport.width}.png`);
  }
  await browser.close();
}

await mkdir(outDir, { recursive: true });

for (const width of [1366, 900]) {
  const viewport = { width, height: 768 };
  await capture(`file:///${proto.replace(/\\/g, '/')}#new`, `prototype-new`, viewport);
  await capture(`http://localhost:5173/screening/new`, `app-new`, viewport);
}

console.log('Screenshots written to', outDir);
