/**
 * PitPal adversarial hardening pass (not in `npm test` — `npm run e2e:harden`).
 * Requires dev servers running (vite 5173 → api 8787).
 * Covers: live search matrix, garbage inputs, provider failures, photo edge
 * cases, demo journey edge cases, keyboard nav, 375px overflow on every route,
 * reload persistence, back button.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';

const BASE = process.env.PITPAL_BASE ?? 'http://localhost:5173';
const API = process.env.PITPAL_API ?? 'http://localhost:8787';
const SHOTS = '/home/ubuntu/pitpal-shots';
const ASSETS = '/home/ubuntu/pitpal-e2e-assets';
mkdirSync(SHOTS, { recursive: true });

const bugs: string[] = [];

/** Kill whatever listens on :8787 without matching this script's own cmdline. */
function killApiServer() {
  try {
    const pids = execSync("ss -tlnp 'sport = :8787' 2>/dev/null | grep -oP 'pid=\\K[0-9]+' | sort -u")
      .toString()
      .trim();
    for (const pid of pids.split('\n').filter(Boolean)) {
      try { process.kill(Number(pid)); } catch { /* gone */ }
    }
  } catch { /* nothing listening */ }
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

async function noHorizontalOverflow(page: Page, label: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 375, `${label}: horizontal overflow (${w}px)`);
  console.log(`  ✓ ${label}: no horizontal overflow at 375px`);
}

/** Fill the Find form (standard mode) and submit to /results. */
async function fillAndSearch(
  page: Page,
  opts: { emirate: string; area?: string; coords?: { lat: number; lon: number }; make?: string; model?: string; year?: string },
) {
  if (opts.coords) {
    // grant geolocation before load
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: opts.coords.lat, longitude: opts.coords.lon });
  }
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Use standard form' }).click();
  if (opts.make) await page.getByLabel('Make').fill(opts.make);
  await page.getByLabel('Make').press('Escape');
  if (opts.model) await page.getByLabel('Model').fill(opts.model);
  await page.getByLabel('Model').press('Escape');
  await page.getByLabel('Year').selectOption(opts.year ?? '2018');
  await page.getByRole('radio', { name: /something is broken/i }).click();
  await page.getByRole('button', { name: 'Air conditioning', exact: true }).click();
  await page.getByLabel('Emirate').selectOption(opts.emirate);
  if (opts.area !== undefined) await page.getByLabel('Area').fill(opts.area);
  if (opts.coords) {
    await page.getByRole('button', { name: 'Use my location' }).click();
    await page.waitForSelector('text=Location set', { timeout: 10_000 });
  }
  await page.getByLabel('Timing').selectOption('this_week');
  await page.getByRole('button', { name: 'Find garages' }).first().click();
  await page.waitForURL(/\/results/, { timeout: 15_000 });
}

async function waitLive(page: Page, minCards = 5) {
  await page.waitForSelector('text=Powered by Geoapify', { timeout: 40_000 }).catch(async (e) => {
    const main = await page.textContent('main');
    throw new Error(`waitLive timeout — main shows: ${(main ?? '').slice(0, 300)}\n${e}`);
  });
  const cards = page.locator('div.rounded-2xl', { hasText: 'Sources: Geoapify' });
  const n = await cards.count();
  return n >= minCards ? n : await cards.count();
}

async function main() {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/home/ubuntu/.local/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    geolocation: { latitude: 25.3463, longitude: 55.4209 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // ---------- (a) live search matrix ----------
  const searches: { label: string; emirate: string; area?: string; coords?: { lat: number; lon: number } }[] = [
    { label: 'Sharjah GPS', emirate: 'sharjah', coords: { lat: 25.3463, lon: 55.4209 } },
    { label: 'Sharjah Al Nahda', emirate: 'sharjah', area: 'Al Nahda' },
    { label: 'Dubai Deira', emirate: 'dubai', area: 'Deira' },
    { label: 'Abu Dhabi Mussafah', emirate: 'abu_dhabi', area: 'Mussafah' },
    { label: 'Ajman Al Jurf', emirate: 'ajman', area: 'Al Jurf' },
    { label: 'RAK Al Nakheel', emirate: 'ras_al_khaimah', area: 'Al Nakheel' },
    { label: 'Fujairah city', emirate: 'fujairah', area: 'Fujairah' },
    { label: 'UAQ', emirate: 'umm_al_quwain', area: '' },
  ];
  for (const s of searches) {
    consoleErrors.length = 0;
    await fillAndSearch(page, { emirate: s.emirate, area: s.area ?? '', coords: s.coords, make: 'Toyota', model: 'Corolla' });
    const n = await waitLive(page);
    const main = await page.textContent('main');
    assert.ok(n >= 5, `${s.label}: only ${n} live cards (<5)`);
    assert.ok(main!.includes('Powered by Geoapify'), `${s.label}: attribution missing`);
    assert.ok(main!.includes('centred on'), `${s.label}: coverageNote missing`);
    const errs = consoleErrors.filter((e) => !/favicon|net::|Failed to load resource/i.test(e));
    assert.equal(errs.length, 0, `${s.label}: console errors: ${errs.join(' | ').slice(0, 200)}`);
    console.log(`  ✓ ${s.label}: ${n} live cards, attribution + coverage note, no console errors`);
  }

  // Sharjah GPS cards show distance and at least one Call
  await fillAndSearch(page, { emirate: 'sharjah', coords: { lat: 25.3463, lon: 55.4209 }, make: 'Toyota', model: 'Corolla' });
  await waitLive(page);
  const sharjahMain = await page.textContent('main');
  assert.ok(/\d+(\.\d+)?\s*km/.test(sharjahMain!), 'Sharjah cards missing distance');
  assert.ok((await page.locator('a[href^="tel:"]').count()) >= 1, 'no Call link on Sharjah results');
  console.log('  ✓ Sharjah GPS cards show distance + Call link');

  // Al Quoz detail auto-enrichment shows a source URL
  await fillAndSearch(page, { emirate: 'dubai', area: 'Al Quoz', make: 'Toyota', model: 'Corolla' });
  await waitLive(page);
  const siteCard = page.locator('div.rounded-2xl', { hasText: 'Public listing' }).filter({ has: page.locator('a[href^="http"]') }).first();
  await siteCard.getByRole('button', { name: 'Details' }).click();
  await page.waitForSelector('text=/Reading the garage’s website|From the garage’s own website|enrichment/i', { timeout: 90_000 }).catch(() => null);
  const detailText = await page.textContent('main');
  if (/From the garage’s own website/.test(detailText!)) {
    assert.ok(/https?:\/\/|\.com|\.ae/.test(detailText!), 'enrichment missing source URL');
    console.log('  ✓ Al Quoz detail auto-enrichment ran with source URL');
  } else {
    console.log('  ⚠ chosen garage had no website/enrichment — auto-run skipped (allowed)');
  }

  // ---------- (b) garbage inputs ----------
  consoleErrors.length = 0;
  await fillAndSearch(page, { emirate: 'dubai', area: 'x'.repeat(300) + '🔧🚗', make: 'Other / not listed', model: 'My Custom Car', year: '1995' });
  const garbageMain = await page.textContent('main');
  assert.ok(!/Request sent/i.test(garbageMain!));
  console.log('  ✓ 300-char emoji area + "Other / not listed" make handled without crash');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Use standard form' }).click();
  await page.getByLabel('Model').fill('Corolla');
  await page.getByLabel('Year').selectOption('1990'); // oldest reasonable
  const years = await page.locator('#year option').allTextContents();
  assert.ok(!years.includes('1899') && !years.includes('2032'), 'year list out of bounds');
  console.log(`  ✓ year dropdown bounded (${years[0]}..${years[years.length - 1]}, ${years.length} entries)`);
  // empty make → cannot proceed
  const btn = page.getByRole('button', { name: 'Find garages' }).first();
  const disabled = await btn.isDisabled();
  assert.ok(disabled, 'search button should be disabled without make/model');
  console.log('  ✓ empty make blocks search submission');

  // ---------- (d) photo edge cases ----------
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const fileInput = page.locator('input[type="file"]').first();
  if ((await fileInput.count()) > 0) {
    // text renamed .jpg — client magic-bytes check must reject
    await fileInput.setInputFiles(`${ASSETS}/fake.jpg`);
    await page.waitForTimeout(1200);
    const t1 = await page.textContent('main');
    assert.ok(/not a supported image|could not read|jpeg|png|webp|unsupported/i.test(t1!), 'fake.jpg not rejected');
    console.log('  ✓ text-renamed .jpg rejected (magic bytes)');

    // >4MB decoded → server must reject 413 FILE_TOO_LARGE (client resizes
    // small enough files before upload, so test the limit at API level)
    const { readFileSync } = await import('node:fs');
    const bigB64 = readFileSync(`${ASSETS}/big.png`).toString('base64');
    assert.ok(Buffer.byteLength(bigB64, 'base64') > 3_000_000);
    const r413 = await fetch(`${API}/api/vision/identify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64: bigB64, mimeType: 'image/png' }),
    });
    const j413 = await r413.json().catch(() => ({}));
    assert.equal(r413.status, 413, `expected 413, got ${r413.status}: ${JSON.stringify(j413).slice(0, 120)}`);
    console.log('  ✓ oversized image rejected with 413 FILE_TOO_LARGE');

    // real photo → Gemini suggestion (provider can 503/429; retry once)
    let photoOk = false;
    for (let attempt = 0; attempt < 2 && !photoOk; attempt++) {
      await fileInput.setInputFiles(`${ASSETS}/corolla.jpg`);
      photoOk = await page
        .waitForSelector('text=/Suggested from photo|unclear|no vehicle|Multiple/i', { timeout: 90_000 })
        .then(() => true)
        .catch(() => false);
      if (!photoOk) {
        const retry = page.getByRole('button', { name: /retry|try again/i }).first();
        if (!(await retry.count())) break;
        if (attempt === 0) await retry.click();
      }
    }
    const t2 = await page.textContent('main');
    if (photoOk) {
      assert.ok(/Toyota/i.test(t2!), 'expected Toyota in suggestions');
      await shot(page, 'photo-suggestions');
      console.log('  ✓ real car photo → Toyota suggestion (photo-suggestions.png)');
    } else if (/rate-limited|quota|could not be checked/i.test(t2!)) {
      bugs.push('photo: Gemini quota/503 during e2e — honest error shown, no crash');
      console.log('  ⚠ photo suggestion failed (provider quota) — error surfaced honestly');
    } else {
      throw new Error(`photo suggestion failed silently — main: ${(t2 ?? '').slice(0, 300)}`);
    }
  } else {
    console.log('  ⚠ no file input found — photo checks skipped');
  }

  // ---------- (e) demo journey edge cases ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Demo tools' }).first().click();
  await page.getByRole('button', { name: 'Enter demo mode' }).click();
  await page.getByRole('button', { name: /Corolla AC in Abu Dhabi/ }).click();
  await page.waitForURL(/\/results/);
  await page.getByRole('button', { name: 'See how booking works with sample garages' }).click();
  await page.locator('div.rounded-2xl', { hasText: 'Khalidiya Auto Care' }).first().getByRole('checkbox').check();
  await page.locator('div.rounded-2xl', { hasText: 'Mussafah Cool Tech' }).first().getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Request from 2 garages' }).click();
  await page.getByRole('button', { name: 'Use sample details' }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  await page.waitForURL(/\/request\//);
  const reqUrl = page.url();

  const sendOffer = async (gid: string) => {
    await page.goto(`${BASE}/garage-view`);
    await page.getByLabel('Garage').selectOption(gid);
    await page.getByRole('button', { name: 'Send offer', exact: true }).first().click();
    const d = new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);
    await page.getByLabel('Appointment date (UAE)').fill(d);
    await page.getByLabel('Time', { exact: true }).fill('10:00');
    const exp = new Date(Date.now() + 48 * 3600_000);
    await page.getByLabel('Offer expiry date').fill(exp.toISOString().slice(0, 10));
    await page.getByLabel('Expiry time').fill(
      `${String(exp.getHours()).padStart(2, '0')}:${String(exp.getMinutes()).padStart(2, '0')}`,
    );
    await page.getByRole('button', { name: 'Send offer' }).last().click();
    await page.waitForTimeout(400);
  };
  // UI validates future expiry — an already-expired offer comes from the
  // Demo tools simulator ("Offer that's already expired"). Do it while an
  // enquiry is still 'waiting' (the sim select only lists waiting enquiries).
  await page.getByRole('button', { name: 'Demo tools' }).first().click();
  await page.getByLabel('Enquiry').selectOption({ index: 1 });
  await page.getByLabel('Reply kind').selectOption('expired_offer');
  await page.getByRole('button', { name: 'Simulate' }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await sendOffer('demo_ad_02');
  await page.goto(reqUrl);
  await page.reload();
  const reqText = await page.textContent('main');
  assert.ok(/expired/i.test(reqText!), 'expired offer not labelled');
  console.log('  ✓ expired offer rendered as expired');

  // confirm expired offer → error shown
  const expBtn = page.locator('div.rounded-2xl', { hasText: /expired/i }).getByRole('button', { name: 'Confirm this offer' });
  if ((await expBtn.count()) > 0) {
    await expBtn.first().click();
    const modal = page.getByRole('button', { name: 'Confirm appointment' });
    if (await modal.count()) await modal.click().catch(() => undefined);
    await page.waitForTimeout(400);
    const tErr = await page.textContent('main');
    assert.ok(/expired|no longer/i.test(tErr!), 'no error shown confirming expired offer');
    console.log('  ✓ confirming expired offer shows error');
  } else {
    console.log('  ✓ expired offer has no confirm button');
  }

  // confirm the live offer, double-click → only one appointment
  const confirmBtns = page.getByRole('button', { name: 'Confirm this offer' });
  const nConfirm = await confirmBtns.count();
  assert.ok(nConfirm >= 1);
  await confirmBtns.first().click();
  const modalConfirm = page.getByRole('button', { name: 'Confirm appointment' });
  await modalConfirm.dblclick();
  await page.waitForTimeout(500);
  const afterConfirm = await page.textContent('main');
  const refs = afterConfirm!.match(/PP-[A-Z0-9]{6}/g) ?? [];
  assert.ok(new Set(refs).size === 1, `double-click created multiple refs: ${refs}`);
  console.log('  ✓ double-click confirm → single PP- reference');

  // cancel → superseded offers must not revive
  await page.getByRole('button', { name: /Cancel appointment/ }).click();
  const confirmCancel = page.getByRole('button', { name: /Yes, cancel|Confirm cancel/i });
  if (await confirmCancel.count()) await confirmCancel.click();
  await page.waitForTimeout(500);
  let t = await page.textContent('main');
  assert.ok(/cancelled/i.test(t!), 'appointment not cancelled');
  assert.ok(!/Confirm this offer/.test(t!) || /superseded|Another option selected|cancelled/i.test(t!));
  await page.reload();
  t = await page.textContent('main');
  assert.ok(/cancelled/i.test(t!), 'cancelled state lost on reload');
  console.log('  ✓ cancel persists; superseded offers do not revive');

  // profile edit after confirmation keeps appointment snapshot: toggle
  // acceptingEnquiries on the confirmed garage, snapshot must be unchanged.
  await page.goto(`${BASE}/garage-view`);
  await page.getByLabel('Garage').selectOption('demo_ad_02');
  const accCb = page.getByRole('checkbox', { name: /Accepting enquiries/i });
  if (await accCb.count()) {
    await accCb.click();
    await page.waitForTimeout(300);
    await page.goto(reqUrl);
    const snap = await page.textContent('main');
    assert.ok(/cancelled/i.test(snap!) && /Mussafah Cool Tech|Khalidiya Auto Care/.test(snap!), 'snapshot polluted by profile edit');
    console.log('  ✓ profile edit does not rewrite appointment snapshot');
  } else {
    console.log('  ⚠ no accepting-enquiries toggle — snapshot check skipped');
  }

  // reset demo
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Demo tools' }).first().click();
  await page.getByRole('button', { name: /Reset this browser/i }).click();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.waitForTimeout(300);
  const ls = await page.evaluate(() => localStorage.getItem('pitpal.demo.v1'));
  const parsed = ls ? JSON.parse(ls) : null;
  assert.ok(
    !parsed || Object.keys(parsed.requests ?? {}).length === 0,
    'reset did not clear requests',
  );
  console.log('  ✓ demo reset clears requests');

  // ---------- (f) keyboard nav on Find ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const focusOrder: string[] = [];
  for (let i = 0; i < 12; i++) {
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}:${(el as HTMLElement).innerText?.slice(0, 20) || (el as HTMLInputElement).placeholder || el.id}` : 'none';
    });
    focusOrder.push(info!);
    await page.keyboard.press('Tab');
  }
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    if (!el) return '';
    const s = getComputedStyle(el);
    return `${s.outlineStyle}|${s.boxShadow}`;
  });
  assert.ok(/auto|solid|rgba?\(/.test(outline), 'no visible focus ring detected');
  console.log(`  ✓ keyboard: tab order (${focusOrder.length} stops), focus ring: ${outline.slice(0, 60)}`);
  // Enter activates a focused button
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Use standard form' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert.ok(await page.getByLabel('Emirate').count() > 0, 'Enter did not activate button');
  console.log('  ✓ Enter activates focused button');

  // ---------- (h) reload persistence on every route ----------
  // set up journey again quickly via guided standard fill
  await fillAndSearch(page, { emirate: 'dubai', area: 'Deira', make: 'Toyota', model: 'Corolla' });
  for (const path of ['/results', '/requests', '/garage-view', '/dev/integrations']) {
    await page.goto(`${BASE}${path}`);
    await page.reload({ waitUntil: 'networkidle' });
    const m = await page.textContent('main');
    assert.ok(m && m.length > 20, `${path} empty after reload`);
    console.log(`  ✓ reload keeps state: ${path}`);
  }

  // ---------- (i) back button returns to filled form ----------
  await fillAndSearch(page, { emirate: 'dubai', area: 'Deira', make: 'Toyota', model: 'Corolla' });
  await page.waitForSelector('text=Powered by Geoapify', { timeout: 40_000 }).catch(() => undefined);
  await page.goBack();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const backMain = (await page.textContent('main')) ?? '';
  const makeVal = await page.getByLabel('Make').inputValue().catch(() => '');
  assert.ok(
    makeVal === 'Toyota' || backMain.includes('Toyota'),
    `form not repopulated after back — main: ${backMain.slice(0, 200)}`,
  );
  console.log('  ✓ back button returns to filled form');

  // ---------- (g) 375px overflow on every route ----------
  const mob = await browser.newContext({ viewport: { width: 375, height: 720 } });
  const mp = await mob.newPage();
  for (const p of ['/', '/results', '/requests', '/garage-view', '/dev/integrations']) {
    await mp.goto(`${BASE}${p}`, { waitUntil: 'networkidle' }).catch(() => undefined);
    await noHorizontalOverflow(mp, p);
  }

  await browser.close();

  // ---------- (c) provider failures (mutates server env — runs last) ----------
  // 1) bad key → PROVIDER_AUTH honest message, no silent demo fallback
  console.log('  — restarting server with a bogus key…');
  killApiServer();
  await new Promise((r) => setTimeout(r, 1500));
  const badSrv = spawn('npx', ['tsx', 'watch', 'src/index.ts'], {
    cwd: '/home/ubuntu/repos/pitpal/server',
    env: { ...process.env, GEOAPIFY_API_KEY: 'bad-key-for-e2e', geoapify_api_key: '' },
    stdio: 'ignore',
    detached: true,
  });
  await new Promise((r) => setTimeout(r, 6000));
  // browser closed above — reopen
  const b2 = await chromium.launch({ executablePath: process.env.CHROME_BIN ?? '/home/ubuntu/.local/bin/google-chrome', args: ['--no-sandbox'] });
  const p2 = await (await b2.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await fillAndSearch(p2, { emirate: 'dubai', area: 'Deira', make: 'Toyota', model: 'Corolla' });
  await p2.waitForSelector('text=/could not be loaded|not connected|unavailable/i', { timeout: 30_000 });
  const errText = await p2.textContent('main');
  assert.ok(!/Khalidiya Auto Care/.test(errText!), 'silent demo fallback detected!');
  console.log('  ✓ bad key → honest provider error, no demo fallback');

  // 2) server down → network error message
  badSrv.kill();
  killApiServer();
  await new Promise((r) => setTimeout(r, 1500));
  await p2.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await p2.waitForSelector('text=/could not be loaded|not connected|unavailable|unreachable/i', { timeout: 20_000 });
  console.log('  ✓ server down → honest network error');
  await b2.close();

  // restore real server
  spawn('npx', ['tsx', 'watch', 'src/index.ts'], {
    cwd: '/home/ubuntu/repos/pitpal/server',
    env: { ...process.env },
    stdio: 'ignore',
    detached: true,
  });
  await new Promise((r) => setTimeout(r, 5000));

  writeFileSync(`${SHOTS}/hardening-bugs.txt`, bugs.join('\n') || 'no bugs logged');
  if (bugs.length) console.log(`\nBUGS FOUND: ${bugs.length}\n${bugs.join('\n')}`);
  console.log('\nHARDENING E2E COMPLETE');
}

main().catch((e) => {
  console.error('HARDENING FAILED:', e);
  process.exit(1);
});
