import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

const REQUIRED = [
  { name: 'Water', cas: '7732-18-5' },
  { name: 'Glycerin', cas: '56-81-5' },
  { name: 'Acid Yellow 23 / Tartrazine', cas: '1934-21-0' },
  { name: 'Sodium Benzoate', cas: '532-32-1' },
  { name: 'Calcium Sulfate Dihydrate / Gypsum', cas: '10101-41-4' },
  { name: 'Copper Powder Flakes', cas: '7440-50-8' },
  { name: 'Starch Gum', cas: '9005-25-8' },
  { name: 'Fine Grade Talc', cas: '14807-96-6' },
];

async function pickAndRead(page, label) {
  await page.locator('#ing-0-id').selectOption({ label });
  const name = await page.locator('#ing-0-id').evaluate((el) => el.options[el.selectedIndex]?.text?.trim() ?? '');
  const cas = await page.locator('tbody tr').first().locator('.ps-cas').textContent();
  return { name, cas: cas?.trim() };
}

async function fillExample(page, rows, rebalance) {
  await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('#ing-0-id').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#ing-0-id')?.hasAttribute('disabled'), null, {
    timeout: 60000,
  });
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) await page.getByRole('button', { name: /add ingredient/i }).click();
    await page.locator(`#ing-${i}-id`).selectOption({ label: rows[i].name });
    await page.locator('tbody tr').nth(i).locator('input[type="number"]').fill(String(rows[i].pct));
  }
  if (rebalance) await page.getByRole('button', { name: 'Rebalance' }).click();
  return (await page.locator('.ps-total .ps-mono').textContent())?.trim();
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${BASE}/screening/new`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('#ing-0-id')?.hasAttribute('disabled'), null, {
    timeout: 60000,
  });

  const picks = [];
  for (const item of REQUIRED) {
    const read = await pickAndRead(page, item.name);
    picks.push({ expected: item, read, ok: read.name === item.name && read.cas === item.cas });
  }

  const copperCu = await page.locator('#ing-0-id option').allTextContents();
  const hasContaminantGroup = copperCu.some((t) => t.includes('Copper (Cu)'));

  const example1Total = await fillExample(
    page,
    [
      { name: 'Water', pct: 78.5 },
      { name: 'Glycerin', pct: 12 },
      { name: 'Acid Yellow 23 / Tartrazine', pct: 8.5 },
      { name: 'Sodium Benzoate', pct: 0.5 },
    ],
    false,
  );

  const example2Total = await fillExample(
    page,
    [
      { name: 'Calcium Sulfate Dihydrate / Gypsum', pct: 62 },
      { name: 'Fine Grade Talc', pct: 18 },
      { name: 'Starch Gum', pct: 12 },
      { name: 'Copper Powder Flakes', pct: 8 },
    ],
    false,
  );

  console.log(JSON.stringify({ picks, hasContaminantGroup, example1Total, example2Total }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
