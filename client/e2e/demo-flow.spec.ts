/**
 * PitPal demo end-to-end drive (not wired into `npm test` — run `npm run e2e`).
 * Requires dev servers: `npm run dev` at repo root.
 * Saves screenshots to /home/ubuntu/pitpal-shots/.
 */
import { chromium, type Browser, type Page } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PITPAL_BASE ?? 'http://localhost:5173';
const SHOTS = '/home/ubuntu/pitpal-shots';
mkdirSync(SHOTS, { recursive: true });

function tomorrowUae(): string {
  return new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);
}
const dayAfterUae = (): string => new Date(Date.now() + 96 * 3600_000).toISOString().slice(0, 10);

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

function card(page: Page, name: string) {
  return page.locator('div.rounded-2xl', { hasText: name }).first();
}

async function noHorizontalOverflow(page: Page, label: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 375, `${label}: horizontal overflow (${w}px)`);
  console.log(`  ✓ ${label}: no horizontal overflow at 375px`);
}

async function fillVehicleStandard(page: Page) {
  await page.getByLabel('Make').fill('Toyota');
  await page.getByLabel('Model').fill('Corolla');
  await page.getByLabel('Year').selectOption('2016');
  await page.getByRole('radio', { name: /something is broken/i }).click();
  await page.getByRole('button', { name: 'Air conditioning', exact: true }).click();
  await page.getByLabel('Emirate').selectOption('abu_dhabi');
  await page.getByLabel('Area').fill('Al Khalidiyah');
  await page.getByLabel('Timing').selectOption('today');
}

async function fillVehicleGuided(page: Page) {
  await page.getByLabel('Make').fill('Toyota');
  await page.getByLabel('Model').fill('Corolla');
  await page.getByLabel('Year').selectOption('2016');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /something is broken/i }).click();
  await page.getByRole('button', { name: 'Air conditioning', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Emirate').selectOption('abu_dhabi');
  await page.getByLabel('Area').fill('Al Khalidiyah');
  await page.getByLabel('Timing').selectOption('today');
}

async function main() {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/home/ubuntu/.local/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // ---- fonts actually render ------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const fonts = await page.evaluate(() =>
    Promise.all(
      [
        document.fonts.load('16px Inter'),
        document.fonts.load('500 24px Newsreader'),
        document.fonts.load('20px "Shadows Into Light"'),
        document.fonts.load('500 13px "IBM Plex Mono"'),
      ].map((p) => p.catch(() => [])),
    ).then((r) => ({
      inter: r[0].length > 0 || document.fonts.check('16px Inter'),
      newsreader: r[1].length > 0,
      hand: r[2].length > 0,
      mono: r[3].length > 0,
    })),
  );
  console.log('fonts:', fonts);
  assert.ok(fonts.inter && fonts.newsreader && fonts.hand && fonts.mono, 'expected all four fonts loaded');

  // ---- guided vs standard produce identical journey state --------------------
  await page.evaluate(() => sessionStorage.clear());
  await fillVehicleGuided(page);
  const guidedJourney = await page.evaluate(() => sessionStorage.getItem('pitpal.journey.v1'));

  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Use standard form' }).click();
  await fillVehicleStandard(page);
  const standardJourney = await page.evaluate(() => sessionStorage.getItem('pitpal.journey.v1'));
  const g = JSON.parse(guidedJourney!);
  const s = JSON.parse(standardJourney!);
  delete g.step; delete s.step; // step marker differs by mode
  assert.deepEqual(s, g, 'standard vs guided journey state differs');
  console.log('  ✓ standard form and guided produce identical journey state');
  await shot(page, 'find-desktop');

  // ---- enter demo + load Corolla AC scenario ---------------------------------
  await page.getByRole('button', { name: 'Demo tools' }).first().click();
  await page.getByRole('button', { name: 'Enter demo mode' }).click();
  await page.getByRole('button', { name: /Corolla AC in Abu Dhabi/ }).click();
  await page.waitForURL(/\/results/);
  // Live is the default tab — switch to the demo tab for demo assertions.
  await page.getByRole('button', { name: 'See how booking works with sample garages' }).click();

  const resultsText = await page.textContent('main');
  assert.ok(resultsText!.includes('Khalidiya Auto Care'), 'demo_ad_01 missing');
  assert.ok(resultsText!.includes('Mussafah Cool Tech'), 'demo_ad_02 missing');
  // suitable section contains both
  const suitable = page.locator('section[aria-label="Suitable garages"]');
  assert.ok(await suitable.textContent()!.then((t) => t!.includes('Khalidiya Auto Care')));
  assert.ok((await suitable.textContent())!.includes('Mussafah Cool Tech'));
  // ad_04: relevant capability but availability never declared → spec verdict is
  // "suitable" with the "Availability needs confirmation" caution.
  const ad04 = await card(page, 'Al Reem Quick Service').textContent();
  assert.ok(ad04!.includes('Availability needs confirmation'), 'ad_04 caution missing');
  // excluded: ad_03 (German-only), ad_05 (distance) — expand section
  await page.getByRole('button', { name: /Not suitable for this request/ }).click();
  const excl = await page.locator('section[aria-label="Not suitable"]').textContent();
  assert.ok(excl!.includes('Corniche German Werks'), 'ad_03 not excluded');
  assert.ok(excl!.includes('Baniyas Motors'), 'ad_05 not excluded');
  console.log('  ✓ results: ad_01/ad_02 suitable, ad_03+ad_05 excluded');

  await shot(page, 'results-desktop');

  // ---- select 2 garages, send request ---------------------------------------
  await card(page, 'Khalidiya Auto Care').getByRole('checkbox').check();
  await card(page, 'Mussafah Cool Tech').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Request from 2 garages' }).click();
  await page.waitForURL(/\/request\/new/);
  await page.getByRole('button', { name: 'Use sample details' }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  await page.waitForURL(/\/request\//);
  assert.ok((await page.textContent('main'))!.includes('Request sent. Waiting for garage responses.'));
  console.log('  ✓ request sent');
  const requestUrl = page.url();

  // ---- garage view: offer from ad_01 ----------------------------------------
  for (const [gid, tax] of [
    ['demo_ad_01', 'unknown'],
    ['demo_ad_02', 'excluded'],
  ] as const) {
    await page.goto(`${BASE}/garage-view`);
    await page.getByLabel('Garage').selectOption(gid);
    await page.getByRole('button', { name: 'Send offer', exact: true }).first().click();
    await page.getByLabel('Appointment date (UAE)').fill(tomorrowUae());
    await page.getByLabel('Time', { exact: true }).fill('10:00');
    await page.getByLabel('Tax').selectOption(tax);
    await page.getByLabel('Offer expiry date').fill(dayAfterUae());
    await page.getByLabel('Expiry time').fill('18:00');
    await page.getByRole('button', { name: 'Send offer' }).last().click();
    await page.waitForTimeout(300);
    console.log(`  ✓ offer sent as ${gid}`);
  }
  await shot(page, 'garage-view');

  // ---- request detail: comparison + confirm ----------------------------------
  await page.goto(requestUrl);
  assert.ok((await page.textContent('main'))!.includes('Compare offers'));
  assert.ok(
    (await page.textContent('main'))!.match(/not directly comparable|cover different work/i),
    'incomparable banner expected (different tax treatment)',
  );
  await shot(page, 'request-detail-comparison');
  await page.getByRole('button', { name: 'Confirm this offer' }).first().click();
  await page.getByRole('button', { name: 'Confirm appointment' }).click();
  await page.waitForTimeout(300);
  const body = await page.textContent('main');
  assert.match(body!, /PP-[A-Z0-9]{6}/, 'no appointment reference');
  assert.ok(body!.includes('Another option selected'), 'superseded label missing');
  console.log('  ✓ confirmed with reference, other enquiry superseded');
  await shot(page, 'request-detail-confirmed');

  // ---- reload: state preserved -----------------------------------------------
  await page.reload();
  const reloaded = await page.textContent('main');
  assert.match(reloaded!, /PP-[A-Z0-9]{6}/, 'reference lost after reload');
  assert.ok(reloaded!.includes('Confirmed'));
  console.log('  ✓ state preserved across reload');

  // ---- restoration scenario ---------------------------------------------------
  await page.evaluate(() => localStorage.removeItem('pitpal.demo.v1'));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Demo tools' }).first().click();
  await page.getByRole('button', { name: /Classic Corolla restoration/ }).click();
  await page.waitForURL(/\/results/);
  await page.getByRole('button', { name: 'See how booking works with sample garages' }).click();
  const suit2 = await page.locator('section[aria-label="Suitable garages"]').textContent();
  assert.ok(suit2!.includes('Al Quoz Heritage Restorations'), 'dxb_01 should be suitable');
  assert.ok(suit2!.includes('Sharjah Classic Works'), 'shj_01 should be suitable');
  await page.getByRole('button', { name: /Not suitable for this request/ }).click();
  const excl2 = await page.locator('section[aria-label="Not suitable"]').textContent();
  assert.ok(excl2!.includes('Jumeirah Toyota & Nissan Service'), 'dxb_02 should be excluded');
  assert.ok(excl2!.includes('2005'), 'year restriction reason missing');
  console.log('  ✓ restoration: dxb_01/shj_01 suitable, dxb_02 excluded (year restriction)');

  // ---- live listings (Geoapify key present): ≥1 public listing + attribution ---
  await page.getByRole('button', { name: 'Live public listings' }).click();
  await page.waitForSelector('text=Powered by Geoapify', { timeout: 30_000 });
  const liveCards = page.locator('div', { hasText: 'Sources: Geoapify' });
  assert.ok((await liveCards.count()) > 0, 'no live public listings rendered');
  const liveText = await page.textContent('main');
  assert.ok(liveText!.includes('centred on'), 'coverage note missing');
  console.log(`  ✓ live results rendered (${await liveCards.count()} cards) with attribution`);
  await shot(page, 'results-live-desktop');

  // ---- directory cards appear once warm (poll up to 3 min) ---------------------
  const dirDeadline = Date.now() + 180_000;
  let dirCount = 0;
  while (Date.now() < dirDeadline) {
    dirCount = await page
      .locator('text=Directory listing — unverified')
      .count();
    const still = await page.locator('text=Still reading').count();
    if (dirCount > 0 || still === 0) break;
    await page.waitForTimeout(10_000);
  }
  assert.ok(dirCount > 0, 'no directory listing cards appeared');
  assert.ok(liveText!.includes('Garage directories'), 'directory section missing');
  console.log(`  ✓ directory section rendered (${dirCount} unmerged cards)`);

  // ---- public listing detail: no request button -------------------------------
  await page
    .locator('div.rounded-2xl', { hasText: 'Sources: Geoapify' })
    .first()
    .getByRole('button', { name: 'Details' })
    .click();
  await page.waitForURL(/\/garage\//);
  const detailText = await page.textContent('main');
  assert.ok(!/Request this garage/.test(detailText!), 'public listing must not have a request button');
  await shot(page, 'garage-detail-public-enriched');

  // ---- primary CTA border is brand green --------------------------------------
  await page.goto(BASE);
  const border = await page
    .getByRole('button', { name: 'Continue' })
    .first()
    .evaluate((el) => getComputedStyle(el).borderColor);
  assert.equal(border, 'rgb(50, 167, 73)', `primary border ${border}`);
  console.log('  ✓ primary button border is rgb(50,167,73)');

  // ---- mobile 375px no overflow ----------------------------------------------
  const mob = await browser.newContext({ viewport: { width: 375, height: 720 } });
  const mp = await mob.newPage();
  await mp.goto(BASE, { waitUntil: 'networkidle' });
  await noHorizontalOverflow(mp, '/');
  await shot(mp, 'find-mobile');
  // reuse demo journey via demo tools
  await mp.getByRole('button', { name: 'Demo tools' }).first().click();
  await mp.getByRole('button', { name: /Corolla AC in Abu Dhabi/ }).click();
  await mp.waitForURL(/\/results/);
  await mp.getByRole('button', { name: 'See how booking works with sample garages' }).click();
  await noHorizontalOverflow(mp, '/results');
  await shot(mp, 'results-mobile');

  await browser.close();
  console.log('\nALL E2E CHECKS PASSED');
}

main().catch((e) => {
  console.error('E2E FAILED:', e);
  process.exit(1);
});
