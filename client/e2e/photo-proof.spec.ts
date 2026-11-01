/* Live photo-ID proof: run real Wikimedia car photos through /api/vision/identify via the UI. */
import { chromium, type Browser } from 'playwright-core';
import { existsSync } from 'node:fs';

const BASE = process.env.PITPAL_BASE ?? 'http://localhost:5173';
const ASSETS = '/home/ubuntu/pitpal-e2e-assets';
const SHOTS = '/home/ubuntu/pitpal-shots';

const photos = [
  { file: 'kia.jpg', shot: 'photo-kia' },
  { file: 'vw.jpg', shot: 'photo-vw' },
  { file: 'hyundai.jpg', shot: 'photo-hyundai' },
];

async function main() {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/home/ubuntu/.local/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  for (const p of photos) {
    const path = `${ASSETS}/${p.file}`;
    if (!existsSync(path)) {
      console.log(`  ⚠ ${p.file} missing — skipped`);
      continue;
    }
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => sessionStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Use standard form' }).click();
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles(path);
    // wait for suggestion UI (or error); retry once on timeout (Gemini can 503)
    let found = await page
      .waitForSelector('text=/Suggested from photo|unclear|No vehicle|could not be checked|Multiple vehicles/i', {
        timeout: 90_000,
      })
      .then(() => true)
      .catch(() => false);
    if (!found) {
      const retry = page.getByRole('button', { name: /try again|retry/i }).first();
      if (await retry.count()) await retry.click();
      found = await page
        .waitForSelector('text=/Suggested from photo|unclear|No vehicle|Multiple vehicles/i', { timeout: 90_000 })
        .then(() => true)
        .catch(() => false);
    }
    const main = await page.textContent('main');
    const fill = {
      make: await page.getByLabel('Make').inputValue().catch(() => ''),
      model: await page.getByLabel('Model').inputValue().catch(() => ''),
      year: await page.getByLabel('Year').inputValue().catch(() => ''),
    };
    console.log(`📸 ${p.file} → make="${fill.make}" model="${fill.model}" year="${fill.year}"`);
    const m = /Suggested from photo|unclear|No vehicle|Multiple vehicles|not connected/.exec(main ?? '');
    console.log(`   ui: ${m?.[0] ?? 'no suggestion text'}`);
    const sugLine = /Likely \d{4}/.exec(main ?? '');
    if (sugLine) console.log(`   ${sugLine[0]}`);
    await page.screenshot({ path: `${SHOTS}/${p.shot}.png`, fullPage: true });
    console.log(`   saved ${p.shot}.png`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error('PHOTO PROOF FAILED:', e);
  process.exit(1);
});
