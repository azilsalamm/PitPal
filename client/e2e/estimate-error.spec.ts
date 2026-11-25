import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.PITPAL_BASE ?? 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/home/ubuntu/.local/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 720 } });
    await page.addInitScript(() => sessionStorage.setItem('pitpal.journey.v1', JSON.stringify({
      vehicle: { make: 'Toyota', model: 'Corolla', year: 2018, source: 'manual' },
      job: { category: 'service', service: 'routine_service' },
      prefs: { emirate: 'dubai', area: 'Al Quoz', travel: 'nearby', timing: 'this_week' },
    })));
    await page.route('**/api/estimate/reviews', (route) => route.fulfill({ json: { reviews: [] } }));
    await page.route('**/api/live/search', (route) => route.fulfill({ json: {
      attribution: 'Geoapify',
      coverageNote: 'QA listings',
      listings: [{
        id: 'geoapify:estimate-test', name: 'Fictional QA Garage', area: 'Al Quoz', emirate: 'dubai',
        listingType: 'public_listing', source: { provider: 'geoapify' },
      }],
    } }));
    let error = { status: 502, code: 'PROVIDER_AUTH', message: 'Gemini credentials were rejected.' };
    await page.route('**/api/estimate', (route) => route.fulfill({
      status: error.status,
      json: { error: { code: error.code, message: error.message } },
    }));
    await page.goto(`${base}/results`);
    const alert = page.getByTestId('estimate-panel').getByRole('alert');
    const getEstimate = page.getByRole('button', { name: 'Get an estimate', exact: true });
    await getEstimate.click();
    assert.equal(await page.getByRole('link', { name: 'Send to garage' }).count(), 0);
    assert.equal(await alert.innerText(), 'Estimates are temporarily unavailable. Please try again later.');
    await page.getByRole('button', { name: 'Close estimate', exact: true }).click();
    error = { status: 504, code: 'PROVIDER_TIMEOUT', message: 'The request timed out.' };
    await getEstimate.click();
    assert.equal(await alert.innerText(), 'Estimates are temporarily unavailable. Please try again later.');
    console.log('PASS: estimate auth failures and timeouts show an availability message without pointing to a missing contact action');
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
