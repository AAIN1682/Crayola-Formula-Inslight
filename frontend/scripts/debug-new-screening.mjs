import { chromium } from 'playwright';

const logs = [];
const network = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

page.on('console', (msg) => logs.push({ type: msg.type(), text: msg.text() }));
page.on('response', async (res) => {
  const url = res.url();
  if (!url.includes('/api/')) return;
  let body = '';
  try {
    body = await res.text();
  } catch {
    body = '(unreadable)';
  }
  network.push({ method: res.request().method(), url, status: res.status(), body: body.slice(0, 2000) });
});

await page.goto('http://localhost:5173/screening/new', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

await page.fill('#ps-product-name', 'Debug Marker Test');
await page.locator('label.ps-mkt').first().click();

// Wait for catalog
await page.waitForTimeout(1500);

// Add rows and pick first catalog option on each
for (let i = 0; i < 6; i++) {
  if (i > 0) {
    await page.getByRole('button', { name: '+ Add ingredient' }).click();
  }
  const selects = page.locator('table.ps-tbl.comp select.ps-in');
  const count = await selects.count();
  const sel = selects.nth(count - 1);
  await sel.waitFor({ state: 'visible' });
  const options = await sel.locator('option').all();
  if (options.length > 1) {
    const val = await options[1].getAttribute('value');
    if (val) await sel.selectOption(val);
  }
  const pcts = [20, 20, 20, 20, 10, 10];
  const inputs = page.locator('table.ps-tbl.comp input.ps-in.num');
  await inputs.nth(i).fill(String(pcts[i]));
}

await page.getByRole('button', { name: 'Save draft' }).click();
await page.waitForTimeout(3000);

const runBtn = page.getByRole('button', { name: 'Run pre-check' });
const disabled = await runBtn.isDisabled();
console.log('RUN_DISABLED', disabled);
if (!disabled) {
  await runBtn.click();
  await page.waitForTimeout(8000);
}

console.log('FINAL_URL', page.url());
console.log('NETWORK', JSON.stringify(network, null, 2));
console.log('CONSOLE', JSON.stringify(logs.filter((l) => l.type === 'error'), null, 2));

await browser.close();
