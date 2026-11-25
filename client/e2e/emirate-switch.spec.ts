import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.PITPAL_BASE ?? 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/home/ubuntu/.local/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 375, height: 720 },
      permissions: ['geolocation'],
      geolocation: { latitude: 25.2048, longitude: 55.2708 },
    });
    await page.goto(base);
    await page.getByRole('button', { name: 'Use standard form' }).click();
    await page.getByLabel('Area').fill('Deira');
    await page.getByRole('button', { name: 'Use my location' }).click();
    await page.getByText(/Location set/).waitFor({ state: 'visible' });
    await page.getByLabel('Emirate').selectOption('sharjah');
    const screenshot = process.env.PITPAL_EVIDENCE;
    if (screenshot) {
      await page.getByRole('heading', { name: 'Where and when?' }).locator('..').screenshot({ path: screenshot });
    }
    const area = await page.getByLabel('Area').inputValue();
    const locations = await page.getByText(/Location set/).allTextContents();
    assert.deepEqual({ area, locations }, { area: '', locations: [] }, 'emirate switch must clear old area and GPS');

    await page.evaluate(() => {
      const geo = navigator.geolocation;
      const original = geo.getCurrentPosition.bind(geo);
      geo.getCurrentPosition = (onPosition, onError, options) => {
        original((position) => {
          window.addEventListener('release-test-location', () => onPosition(position), { once: true });
          document.documentElement.dataset.testLocation = 'ready';
        }, onError, options);
      };
    });
    await page.getByRole('button', { name: 'Use my location' }).click();
    await page.locator('html[data-test-location=ready]').waitFor();
    await page.getByLabel('Emirate').selectOption('abu_dhabi');
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('release-test-location'));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const prefs = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pitpal.journey.v1') ?? '{}').prefs);
    assert.deepEqual({ emirate: prefs.emirate, coords: prefs.coords }, { emirate: 'abu_dhabi', coords: undefined });
    console.log('PASS: changing the emirate clears the old area and GPS coordinates');
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
