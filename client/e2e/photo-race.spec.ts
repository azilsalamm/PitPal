import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.PITPAL_BASE ?? 'http://localhost:5173';
const vision = '**/api/vision/identify';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/home/ubuntu/.local/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 720 } });
    let release: () => void = () => undefined;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    await page.route(vision, async (route) => {
      await delayed;
      await route.fulfill({
        json: {
          requestToken: route.request().postDataJSON().requestToken,
          result: {
            imageQuality: 'ok',
            multipleVehicles: false,
            suggestions: [{
              make: 'Toyota', model: 'Corolla', yearFrom: 2014, yearTo: 2019, confidence: 'high', note: 'Sedan',
            }],
          },
        },
      });
    });

    await page.goto(base);
    const fixture = process.env.PITPAL_PHOTO;
    const jpeg = await page.evaluate(() => document.createElement('canvas').toDataURL('image/jpeg').split(',')[1]);
    const upload = () => page.getByLabel('Vehicle photo').setInputFiles(fixture ?? {
      name: 'test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64'),
    });
    const request = page.waitForRequest(vision);
    await upload();
    await request;
    const make = page.getByLabel('Make', { exact: true });
    const model = page.getByLabel('Model', { exact: true });
    await make.fill('Honda');
    await model.fill('Civic');
    const response = page.waitForResponse(vision);
    release();
    await response;
    await page.getByText('Identifying vehicle…', { exact: true }).waitFor({ state: 'hidden' });
    const screenshot = process.env.PITPAL_EVIDENCE;
    if (screenshot) {
      await page.getByRole('heading', { name: 'Your vehicle' }).locator('..').screenshot({ path: screenshot });
    }
    assert.deepEqual([await make.inputValue(), await model.inputValue()], ['Honda', 'Civic']);

    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await upload();
    await page.getByText('Suggested from photo — please check', { exact: true }).waitFor();
    assert.deepEqual([await make.inputValue(), await model.inputValue()], ['Toyota', 'Corolla']);
    console.log('PASS: photo ID preserves edits made while waiting and still autofills untouched fields');
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
