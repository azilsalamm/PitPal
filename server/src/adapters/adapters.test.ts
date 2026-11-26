import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Key presence is stubbed; fetch is fully mocked — no real network.
process.env.GEOAPIFY_API_KEY ||= 'test-key';
process.env.GEMINI_API_KEY ||= 'test-key';
process.env.CONTEXT_DEV_API_KEY ||= 'test-key';

const realFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('geoapify adapter', () => {
  it('maps features to public listings, dedupes by place_id, drops nameless', async () => {
    const { searchGarages } = await import('./geoapify.js');
    mockFetch.mockResolvedValue(
      jsonResponse({
        features: [
          {
            properties: {
              place_id: 'p1',
              name: 'Test Garage',
              formatted: 'Street 1, Dubai',
              suburb: 'Al Quoz',
              state: 'Dubai',
              datasource: { raw: { phone: '+9714000', website: 'https://example.com' } },
            },
            geometry: { coordinates: [55.2, 25.1] },
          },
          { properties: { place_id: 'p1', name: 'Test Garage dup' } },
          { properties: { place_id: 'p2' } }, // nameless → dropped
        ],
      }),
    );
    const out = await searchGarages({
      centre: { lat: 25.1, lon: 55.2 },
      radiusM: 15000,
      requestEmirate: 'dubai',
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('geoapify:p1');
    expect(out[0].listingType).toBe('public_listing');
    expect(out[0].participation).toEqual({ status: 'none', acceptingEnquiries: false });
    expect(out[0].area).toBe('Al Quoz');
    expect(out[0].emirate).toBe('dubai');
    expect(out[0].phone).toBe('+9714000');
    expect(out[0].website).toBe('https://example.com');
    const called = new URL(mockFetch.mock.calls[0][0] as string);
    expect(called.searchParams.get('filter')).toBe('circle:55.2,25.1,15000');
    expect(called.searchParams.get('bias')).toBe('proximity:55.2,25.1');
  });

  it('maps 401→PROVIDER_AUTH and 429→PROVIDER_QUOTA', async () => {
    const { searchGarages, ProviderError } = await import('./geoapify.js');
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    await expect(
      searchGarages({ centre: { lat: 0, lon: 0 }, radiusM: 1, requestEmirate: 'dubai' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH', status: 502 });
    mockFetch.mockResolvedValue(jsonResponse({}, 429));
    await expect(
      searchGarages({ centre: { lat: 0, lon: 0 }, radiusM: 1, requestEmirate: 'dubai' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_QUOTA', status: 429 });
    expect(ProviderError).toBeDefined();
  });

  it('geocodeArea returns null when no results', async () => {
    const { geocodeArea } = await import('./geoapify.js');
    mockFetch.mockResolvedValue(jsonResponse({ features: [] }));
    expect(await geocodeArea('Nowhere, Dubai, UAE')).toBeNull();
    expect(mockFetch.mock.calls[0][0]).toContain('geocode');
    expect(mockFetch.mock.calls[0][0]).toContain('countrycode%3Aae');
  });
});

describe('gemini adapter', () => {
  const okBody = (text: string) =>
    jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).toString('base64');

  it('parses a valid vision result', async () => {
    const { identifyVehicle } = await import('./gemini.js');
    const result = {
      imageQuality: 'ok',
      multipleVehicles: false,
      suggestions: [
        { make: 'Toyota', model: 'Corolla', yearFrom: 2014, yearTo: 2019, confidence: 'medium', note: 'sedan shape' },
      ],
    };
    mockFetch.mockResolvedValue(okBody(JSON.stringify(result)));
    const out = await identifyVehicle(jpeg, 'image/jpeg');
    expect(out.imageQuality).toBe('ok');
    expect(out.suggestions[0].make).toBe('Toyota');
  });

  it('passes through unclear / no_vehicle honestly', async () => {
    const { identifyVehicle } = await import('./gemini.js');
    mockFetch.mockResolvedValue(
      okBody(JSON.stringify({ imageQuality: 'unclear', multipleVehicles: true, suggestions: [] })),
    );
    const out = await identifyVehicle(jpeg, 'image/jpeg');
    expect(out.imageQuality).toBe('unclear');
    expect(out.multipleVehicles).toBe(true);
    expect(out.suggestions).toHaveLength(0);
  });

  it('rejects unparsable model output as PROVIDER_ERROR', async () => {
    const { identifyVehicle } = await import('./gemini.js');
    mockFetch.mockResolvedValue(okBody('{"imageQuality": 42}'));
    await expect(identifyVehicle(jpeg, 'image/jpeg')).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
  });

  it('shares the 50-second vision deadline across model fallback and retries', async () => {
    const { identifyVehicle } = await import('./gemini.js');
    vi.stubEnv('GEMINI_MODEL', 'test-primary');
    vi.stubEnv('GEMINI_FALLBACK_MODELS', 'test-fallback');
    vi.useFakeTimers();
    const started = Date.now();
    const calls: number[] = [];
    mockFetch.mockImplementation(async (_url: string, { signal }: { signal: AbortSignal }) => {
      calls.push(Date.now() - started);
      if (calls.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 18_000));
        return jsonResponse({}, 429);
      }
      return waitForAbort(signal);
    });
    const finished = expect(identifyVehicle(jpeg, 'image/jpeg')).rejects.toMatchObject({
      status: 504, code: 'PROVIDER_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(50_000);
    await finished;
    expect(calls).toEqual([0, 18_000, 38_000]);
  });

  it('does not retry a provider response when less than a second remains', async () => {
    const { fetchJsonWithDeadline } = await import('../lib/fetchWithTimeout.js');
    vi.useFakeTimers();
    mockFetch.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return jsonResponse({}, 503);
    });
    const finished = expect(
      fetchJsonWithDeadline('https://example.com', {}, 5_000, Date.now() + 1_500),
    ).rejects.toMatchObject({ name: 'FetchTimeoutError' });
    await vi.advanceTimersByTimeAsync(700);
    await finished;
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('estimate deadline', () => {
  it('retries website enrichment on the next identical estimate after a timeout', async () => {
    const { buildEstimate } = await import('./estimate.js');
    vi.stubEnv('CONTEXT_DEV_API_KEY', 'test-key');
    vi.useFakeTimers();
    const input = {
      garage: { name: 'Cache test garage', emirate: 'dubai', website: 'https://example.com', listedServices: [] },
      vehicle: { make: 'Toyota', model: 'Corolla' },
      job: { category: 'service', service: 'routine_service', description: '' },
    };
    const estimate = {
      summary: 'Routine service', items: [], totalLowAed: 100, totalHighAed: 150,
      recommendedSpec: [], questionsForGarage: [], garageFitNotes: [], confidence: 'low',
    };
    const enrichmentResponse = {
      status: 'ok', data: { publishedFees: [{ service: 'Routine service', amountAed: 120 }] },
    };
    let websiteAttempts = 0;
    mockFetch.mockImplementation(async (url: string, { signal }: { signal: AbortSignal }) => {
      if (new URL(url).hostname === 'api.context.dev') {
        if (++websiteAttempts === 1) return waitForAbort(signal);
        return jsonResponse(enrichmentResponse);
      }
      return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(estimate) }] } }] });
    });

    const first = buildEstimate(input);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await first).toMatchObject({ estimate, enrichment: null });
    expect(await buildEstimate(input)).toMatchObject({
      enrichment: { publishedFees: [{ service: 'Routine service', amountAed: 120 }] },
    });
    await buildEstimate(input);
    expect(websiteAttempts).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('counts website enrichment and a stalled Gemini response body against the same budget', async () => {
    const { buildEstimate } = await import('./estimate.js');
    vi.useFakeTimers();
    const started = Date.now();
    const calls: Array<[string, number]> = [];
    mockFetch.mockImplementation(async (url: string, { signal }: { signal: AbortSignal }) => {
      const host = new URL(url).hostname;
      calls.push([host, Date.now() - started]);
      if (host === 'api.context.dev') return waitForAbort(signal);
      return { ok: true, status: 200, json: () => waitForAbort(signal) };
    });
    const finished = expect(buildEstimate({
      garage: { name: 'Fictional garage', emirate: 'dubai', website: 'https://example.com', listedServices: [] },
      vehicle: { make: 'Toyota', model: 'Corolla' },
      job: { category: 'service', service: 'routine_service', description: '' },
    })).rejects.toMatchObject({
      status: 504, code: 'PROVIDER_TIMEOUT', message: 'This is taking longer than usual. Please try again.',
    });
    await vi.advanceTimersByTimeAsync(50_000);
    await finished;
    expect(calls).toEqual([['api.context.dev', 0], ['generativelanguage.googleapis.com', 15_000]]);
  });
});

describe('vision route magic bytes', () => {
  it('sniffs jpeg/png/webp and rejects non-images', async () => {
    const { sniffMime } = await import('../routes/vision.js');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
    expect(
      sniffMime(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe('image/webp');
    expect(sniffMime(Buffer.from('not an image'))).toBeNull();
  });
});

describe('contextdev adapter', () => {
  it('maps extract response with provenance', async () => {
    const { extractWebsite } = await import('./contextdev.js');
    mockFetch.mockResolvedValue(
      jsonResponse({
        status: 'ok',
        urls_analyzed: ['https://example.com/', 'https://example.com/about'],
        data: {
          services: ['AC repair'],
          makes: ['Toyota'],
          publishedFees: [{ service: 'Inspection', amountAed: 150, scopeNote: 'basic' }],
          phone: '+9712xxxx',
        },
      }),
    );
    const out = await extractWebsite('https://example.com/');
    expect(out.sourceUrl).toBe('https://example.com/');
    expect(out.urlsAnalyzed).toHaveLength(2);
    expect(out.factChecked).toBe(true);
    expect(out.services).toEqual(['AC repair']);
    expect(out.publishedFees[0].amountAed).toBe(150);
    expect(out.openingHours).toBeNull();
  });

  it('empty/absent fields stay empty — nothing invented', async () => {
    const { extractWebsite } = await import('./contextdev.js');
    mockFetch.mockResolvedValue(jsonResponse({ data: {} }));
    const out = await extractWebsite('https://example.com/');
    expect(out.services).toEqual([]);
    expect(out.phone).toBeNull();
    expect(out.publishedFees).toEqual([]);
  });
});

describe('find-website token filter', () => {
  it('keeps only results whose host/title contain a non-generic name token', async () => {
    const { filterCandidates, nameTokens } = await import('../routes/enrichment.js');
    expect(nameTokens('Al Noor Auto Garage LLC')).toEqual(['noor']);
    const out = filterCandidates('Al Noor Auto Garage LLC', [
      { url: 'https://alnoor.example.com/', title: 'Al Noor garage' },
      { url: 'https://random-garage-directory.example.com/', title: 'List of garages' },
      { url: 'not a url', title: 'Al Noor' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].matchedOn).toBe('noor');
  });
});

describe('directories adapter', () => {
  it('normalises rows, filters emirate, dedupes, classifies links', async () => {
    const { classifyUrl, normaliseEmirate, normalisePhone } = await import('./directories.js');
    expect(classifyUrl('https://www.reachuae.com/listing/1', 'www.reachuae.com')).toEqual({
      directoryProfileUrl: 'https://www.reachuae.com/listing/1',
    });
    expect(classifyUrl('https://maps.google.com/?q=x', 'www.reachuae.com')).toEqual({
      mapsUrl: 'https://maps.google.com/?q=x',
    });
    expect(classifyUrl('https://kmgarage.com/', 'www.reachuae.com')).toEqual({
      website: 'https://kmgarage.com/',
    });
    expect(normaliseEmirate('Abu Dhabi')).toBe('abu_dhabi');
    expect(normaliseEmirate('France')).toBeNull();
    expect(normalisePhone('050 123 4567')).toBe('+971501234567');
  });

  it('normaliseRows filters emirate, dedupes, skips nameless; aggregate handles partial failure + area fallback', async () => {
    const { aggregateDirectories, normaliseRows, DIRECTORY_SOURCES } = await import('./directories.js');
    const src = DIRECTORY_SOURCES[0];
    const seen = new Set<string>();
    const rows = normaliseRows(
      src,
      [
        { name: 'Khalidiya Motors', area: 'Al Khalidiyah', emirate: 'Abu Dhabi', phone: '02 555 1234', services: ['AC repair'] },
        { name: 'Khalidiya Motors', area: 'Al Khalidiyah', emirate: 'Abu Dhabi' }, // dup
        { name: 'Dubai Only Garage', emirate: 'Dubai' }, // wrong emirate
        { name: null }, // nameless
      ],
      '2025-01-01T00:00:00Z',
      'abu_dhabi',
      seen,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(/^dir:reachuae:/);
    expect(rows[0].phone).toBe('+97125551234');
    expect(rows[0].listedServices).toEqual(['AC repair']);

    const rawRows = [
      { name: 'Khalidiya Motors', area: 'Al Khalidiyah', emirate: 'Abu Dhabi', phone: '02 555 1234', services: ['AC repair'] },
      { name: 'Khalidiya Motors', area: 'Al Khalidiyah', emirate: 'Abu Dhabi' },
      { name: 'Dubai Only Garage', emirate: 'Dubai' },
      { name: null },
    ];
    const res = aggregateDirectories(
      'abu_dhabi',
      'khalidiyah',
      [{ source: src, rows: rawRows, retrievedAt: '2025-01-01T00:00:00Z' }],
      ['Still warming'],
      [{ source: 'AWNIC premium garages', code: 'PROVIDER_ERROR' }],
    );
    expect(res.listings).toHaveLength(1);
    expect(res.pending).toEqual(['Still warming']);
    expect(res.sourceErrors[0].code).toBe('PROVIDER_ERROR');
    // directory listings have no capability claims
    expect(res.listings[0]).not.toHaveProperty('services');

    const fallback = aggregateDirectories(
      'abu_dhabi',
      'nonexistent area',
      [{ source: src, rows: rawRows, retrievedAt: '2025-01-01T00:00:00Z' }],
      [],
      [],
    );
    expect(fallback.coverageNote).toMatch(/whole emirate/i);
    expect(fallback.listings).toHaveLength(1);

    const matched = aggregateDirectories(
      'abu_dhabi',
      'khalidiyah',
      [{ source: src, rows: rawRows, retrievedAt: '2025-01-01T00:00:00Z' }],
      [],
      [],
    );
    expect(matched.coverageNote).toMatch(/Filtered to/);
  });
});

describe('places widening (route, mocked fetch)', () => {
  it('widens 15→25 km until ≥5 listings and reports widened', async () => {
    const { default: express } = await import('express');
    const { placesRouter } = await import('../routes/places.js');
    const app = express();
    app.use('/api/places', express.json(), placesRouter);
    const srv = await new Promise<import('node:http').Server>((r) => {
      const s = app.listen(0, () => r(s));
    });
    const port = (srv.address() as { port: number }).port;
    const feature = (id: string) => ({
      properties: { place_id: id, name: `G${id}`, state: 'Sharjah' },
      geometry: { coordinates: [55.4, 25.3] },
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ features: [feature('a'), feature('b')] })) // 15km: 2
      .mockResolvedValueOnce(
        jsonResponse({ features: ['a', 'b', 'c', 'd', 'e', 'f'].map(feature) }), // 25km: 6
      );
    const res = await realFetch(`http://127.0.0.1:${port}/api/places/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        emirate: 'sharjah',
        coords: { lat: 25.32, lon: 55.4 },
        travel: 'nearby',
      }),
    });
    const body = await res.json();
    srv.close();
    expect(res.status).toBe(200);
    expect(body.widened).toBe(true);
    expect(body.radiusKm).toBe(25);
    expect(body.listings.length).toBe(6);
    expect(body.coverageNote).toMatch(/Widened to 25 km/);
    expect(body.centre.label).toBe('your location');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('vehicles adapter', () => {
  it('filters vPIC makes to the UAE allowlist and unions static extras', async () => {
    const { getMakes } = await import('./vehicles.js');
    mockFetch.mockResolvedValue(
      jsonResponse({
        Results: [
          { MakeName: 'Toyota Motor Corporation' },
          { MakeName: 'Not AUAE Make' },
          { MakeName: 'NISSAN MOTOR COMPANY' },
        ],
      }),
    );
    const r = await getMakes();
    const names = r.makes.map((m) => m.name);
    expect(names).toContain('Toyota');
    expect(names).toContain('Nissan');
    expect(names).toContain('BYD'); // static allowlist member even if vPIC lacks it
    expect(names.some((n) => /Not AUAE/i.test(n))).toBe(false);
    expect(r.sources).toContain('vPIC');
  });

  it('unions vPIC models with UAE extras, dedupes case-insensitively', async () => {
    const { getModels } = await import('./vehicles.js');
    mockFetch.mockResolvedValue(
      jsonResponse({ Results: [{ Model_Name: 'corolla' }, { Model_Name: 'Tacoma' }] }),
    );
    const r = await getModels('Toyota');
    const names = r.models.map((m) => m.name);
    expect(names.filter((n) => n.toLowerCase() === 'corolla')).toHaveLength(1);
    expect(names).toContain('Land Cruiser');
    expect(names).toContain('Tacoma');
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('falls back to static UAE list when vPIC is down', async () => {
    const { getMakes, getModels, clearVehicleCache } = await import('./vehicles.js');
    clearVehicleCache();
    mockFetch.mockRejectedValue(new Error('network down'));
    const mk = await getMakes();
    expect(mk.sources).toContain('static');
    expect(mk.makes.length).toBeGreaterThan(30);
    const md = await getModels('Nissan');
    expect(md.sources).toContain('static');
    expect(md.models.map((m) => m.name)).toContain('Patrol');
  });
});
