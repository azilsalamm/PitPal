import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { garageDirectionsUrl } from '../src/lib/directions';

const base = process.env.PITPAL_BASE ?? 'http://localhost:5173';
const name = 'QA Auto & Repair';
const address = '7 Street, Al Nahda, Sharjah, United Arab Emirates';

async function main() {
  for (const address of [undefined, '   ', ' qa auto & repair, ']) {
    const maps = new URL(garageDirectionsUrl({ name, address, area: 'Al Nahda', emirate: 'sharjah' }));
    assert.equal(maps.searchParams.get('destination'), `${name}, Al Nahda, sharjah, United Arab Emirates`);
  }

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/home/ubuntu/.local/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 720 } });
    await page.addInitScript(() => {
      sessionStorage.setItem('pitpal.journey.v1', JSON.stringify({
        vehicle: { make: 'Toyota', model: 'Corolla', year: 2018, source: 'manual' },
        job: { category: 'service', service: 'routine_service' },
        prefs: { emirate: 'sharjah', area: 'Al Nahda', travel: 'nearby', timing: 'this_week' },
      }));
      window.open = (url) => {
        document.documentElement.dataset.opened = String(url);
        return null;
      };
    });
    await page.route('**/api/estimate/reviews', (route) => route.fulfill({ json: { reviews: [] } }));
    await page.route('**/api/live/search', (route) => route.fulfill({ json: {
      attribution: 'Geoapify',
      coverageNote: 'QA listings',
      listings: [{
        id: 'geoapify:directions-test', name, address, area: 'Al Nahda', emirate: 'sharjah',
        listingType: 'public_listing', source: { provider: 'geoapify' },
        coords: { lat: 25.3, lon: 55.37 }, specialities: [],
      }],
    } }));

    const directionUrl = async () => {
      await page.getByRole('button', { name: 'Directions', exact: true }).click();
      return page.evaluate(() => document.documentElement.dataset.opened ?? '');
    };
    await page.goto(`${base}/results`);
    const resultUrl = await directionUrl();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('heading', { name, exact: true }).waitFor();
    const detailUrl = await directionUrl();

    for (const url of [resultUrl, detailUrl]) {
      const maps = new URL(url);
      assert.equal(maps.origin, 'https://www.google.com');
      assert.equal(maps.pathname, '/maps/dir/');
      assert.equal(maps.searchParams.get('api'), '1');
      assert.equal(maps.searchParams.get('destination'), `${name}, ${address}`);
    }
    console.log('PASS: results and garage details send the garage name and address to Google Maps Directions');
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
