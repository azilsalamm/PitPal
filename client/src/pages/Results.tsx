import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  directoryHints,
  evaluateEligibility,
  haversineKm,
  mergeListings,
  rankEvaluations,
  requiredService,
  type DirectoryListing,
  type DirectorySearchResponse,
  type Evaluation,
  type Garage,
  type MergedListing,
  type PlacesSearchResponse,
} from '@pitpal/shared';
import { saveDirListings, saveLiveListings } from '../lib/dirStore';
import { useAppState } from '../state/AppStateContext';
import { Button, Card, StatusPill } from '../components/ui';
import { PalAvatar } from '../components/pal/PalAvatar';
import { ApiError, postJson } from '../lib/api';
import { EstimatePanel, estimateMessage, type EstimateRequest } from '../components/EstimatePanel';

interface GarageReview {
  id: string;
  fit: 'strong' | 'good' | 'possible' | 'unclear';
  review: string;
  bestFor: string;
}
const FIT_LABEL: Record<GarageReview['fit'], { text: string; tone?: 'good' | 'warn' }> = {
  strong: { text: 'Strong fit for your car', tone: 'good' },
  good: { text: 'Good fit', tone: 'good' },
  possible: { text: 'Possible — confirm by phone' },
  unclear: { text: 'Fit unclear — confirm by phone' },
};
import { AVAILABILITY_LABELS, formatAed, formatDateTime } from '../lib/format';

function distanceLabel(e: Evaluation): string | null {
  if (e.distanceKm == null) return null;
  return `≈ ${e.distanceKm.toFixed(1)} km, straight-line`;
}

function AvailabilityPill({ a }: { a: Evaluation['availability'] }) {
  const tone = a === 'today' ? 'good' : a === 'this_week' ? 'good' : a === 'needs_confirmation' ? 'warn' : 'bad';
  return <StatusPill tone={tone}>{AVAILABILITY_LABELS[a]}</StatusPill>;
}

export default function Results() {
  const { journey, demo, dispatchDemo, garages } = useAppState();
  const navigate = useNavigate();
  // Live is the default for everyone — demo is a secondary tab.
  const [source, setSource] = useState<'live' | 'demo'>('live');
  const [live, setLive] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'error'; code: string; message: string }
    | { kind: 'done'; res: PlacesSearchResponse & { directories?: DirectorySearchResponse } }
  >({ kind: 'idle' });
  const [selected, setSelected] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [estimateFor, setEstimateFor] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, GarageReview>>({});
  const [reviewsState, setReviewsState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [estimates, setEstimates] = useState<Record<string, Parameters<Parameters<typeof EstimatePanel>[0]['onEstimate']>[0]>>({});

  const { vehicle, job, prefs } = journey;
  const ready = vehicle && job && prefs;
  const nowIso = new Date().toISOString();

  const ranked = useMemo(() => {
    if (!ready) return null;
    const criteria = { vehicle, job, prefs, nowIso };
    const evals = garages.map((g) => evaluateEligibility(g, criteria));
    const map = Object.fromEntries(garages.map((g) => [g.id, g]));
    return rankEvaluations(evals, criteria, map);
  }, [ready, vehicle, job, prefs, garages, nowIso]);

  // One combined endpoint: Geoapify + cached directories; poll every 8 s
  // while directory sources are still warming.
  useEffect(() => {
    if (source !== 'live' || !ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => {
      setLive((d) => (d.kind === 'done' ? d : { kind: 'loading' }));
      postJson<PlacesSearchResponse & { directories?: DirectorySearchResponse }>(
        '/api/live/search',
        { emirate: prefs.emirate, area: prefs.area, coords: prefs.coords, travel: prefs.travel },
      )
        .then((res) => {
          if (cancelled) return;
          setLive({ kind: 'done', res });
          saveLiveListings(res.listings);
          if (res.directories) saveDirListings(res.directories.listings);
          if ((res.directories?.pending.length ?? 0) > 0) {
            timer = setTimeout(load, 8_000);
          }
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          if (e instanceof ApiError) {
            setLive({ kind: 'error', code: e.code, message: e.message });
          } else {
            setLive({ kind: 'error', code: 'PROVIDER_ERROR', message: 'Live listings are unavailable right now.' });
          }
        });
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, ready, prefs]);

  const dirs =
    live.kind === 'done' && live.res.directories
      ? { kind: 'done' as const, res: live.res.directories }
      : { kind: 'loading' as const };

  // Merge directory rows into Geoapify listings by normalised name (same emirate).
  const mergedLive = useMemo(() => {
    const geo = live.kind === 'done' ? live.res.listings : [];
    const dir = dirs.kind === 'done' ? dirs.res.listings : [];
    return mergeListings(geo, dir);
  }, [live, dirs]);

  const required = job ? requiredService(job) : 'general_inspection';

  const sortedMerged = useMemo(() => {
    const hintsOf = (m: MergedListing) =>
      m.directory ? directoryHints(m.directory.listedServices, vehicle!.make, required) : null;
    const dist = (m: MergedListing) =>
      m.garage.coords && prefs?.coords
        ? haversineKm(prefs.coords, m.garage.coords)
        : Number.POSITIVE_INFINITY;
    const fitRank: Record<GarageReview['fit'], number> = { strong: 0, good: 1, possible: 2, unclear: 3 };
    const fitOf = (m: MergedListing) => (reviews[m.garage.id] ? fitRank[reviews[m.garage.id].fit] : 1.5);
    return [...mergedLive.merged].sort((a, b) => {
      const f = fitOf(a) - fitOf(b);
      if (f !== 0) return f;
      const sa = hintsOf(a)?.service === 'listed' ? 0 : 1;
      const sb = hintsOf(b)?.service === 'listed' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const d = dist(a) - dist(b);
      if (d !== 0) return d;
      return a.garage.name.localeCompare(b.garage.name);
    });
  }, [mergedLive, vehicle, required, prefs?.coords, reviews]);

  // One batched AI review call per results set: why each garage suits (or not) this car + job.
  const reviewKey = useMemo(
    () => (sortedMerged.length ? JSON.stringify(sortedMerged.slice(0, 30).map((m) => m.garage.id)) : ''),
    [sortedMerged],
  );
  useEffect(() => {
    if (!reviewKey || !vehicle) return;
    const missing = sortedMerged.slice(0, 30).filter((m) => !reviews[m.garage.id]);
    if (!missing.length) return;
    let cancelled = false;
    setReviewsState('loading');
    postJson<{ reviews: GarageReview[] }>('/api/estimate/reviews', {
      vehicle: { make: vehicle.make, model: vehicle.model, year: vehicle.year ?? null },
      job: { service: required, description: job?.description ?? '' },
      garages: missing.map((m) => ({
        id: m.garage.id,
        name: m.garage.name,
        address: m.garage.address || [m.garage.area || m.directory?.area, m.garage.emirate].filter(Boolean).join(', '),
        website: m.garage.website ?? m.directory?.website ?? null,
        listedServices: m.directory?.listedServices ?? [],
        openingHours: m.garage.openingHours ?? null,
      })),
    })
      .then((r) => {
        if (cancelled) return;
        setReviews((prev) => Object.fromEntries([...Object.entries(prev), ...r.reviews.map((x) => [x.id, x] as const)]));
        setReviewsState('done');
      })
      .catch(() => {
        if (!cancelled) setReviewsState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reviewKey]);

  if (!ready) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-muted">Tell us about the car and the job first.</p>
        <Button className="mt-4" onClick={() => navigate('/')}>
          Start over
        </Button>
      </main>
    );
  }

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s));

  const demoCard = (g: Garage, e: Evaluation, selectable: boolean) => (
    <Card key={g.id} className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{g.name}</h3>
          <p className="text-sm text-muted">
            {g.area} {distanceLabel(e) ? `· ${distanceLabel(e)}` : ''}
          </p>
        </div>
        <StatusPill tone="demo">Sample garage</StatusPill>
      </div>
      <div className="flex flex-wrap gap-2">
        <AvailabilityPill a={e.availability} />
      </div>
      <ul className="list-disc pl-5 text-sm">
        {e.reasons.slice(0, 2).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {e.cautions.slice(0, 2).map((c) => (
        <p key={c} className="text-sm text-accent">
          {c}
        </p>
      ))}
      {e.exclusionReasons.map((r) => (
        <p key={r} className="text-sm text-red-800">
          {r}
        </p>
      ))}
      {e.relevantPrice && (
        <p className="text-sm">
          {e.relevantPrice.scope}: <strong>{formatAed(e.relevantPrice.amountAed)}</strong>
        </p>
      )}
      <div className="mt-auto flex items-center gap-3 pt-2">
        <Button variant="ghost" className="min-h-[40px] px-3 text-sm" onClick={() => navigate(`/garage/${g.id}`)}>
          Details
        </Button>
        {selectable && (
          <label className="ml-auto flex min-h-[48px] items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={selected.includes(g.id)}
              disabled={!selected.includes(g.id) && selected.length >= 3}
              onChange={() => toggleSelect(g.id)}
            />
            Request
          </label>
        )}
      </div>
    </Card>
  );

  const liveCard = (m: MergedListing) => {
    const g = m.garage;
    const dir = m.directory;
    const d =
      g.coords && prefs.coords
        ? `≈ ${haversineKm(prefs.coords, g.coords).toFixed(1)} km, straight-line`
        : null;
    const mapsUrl = g.coords
      ? `https://www.google.com/maps/dir/?api=1&destination=${g.coords.lat},${g.coords.lon}`
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${g.name} ${g.area}`)}`;
    const hints = dir ? directoryHints(dir.listedServices, vehicle!.make, required) : null;
    const website = g.website ?? dir?.website;
    const phone = g.phone ?? dir?.phone;
    const isMobile = phone ? /^\+9715/.test(phone.replace(/\s/g, '')) : false;
    const domain = website ? new URL(website).hostname.replace(/^www\./, '') : null;
    const estimateReq: EstimateRequest = {
      garage: { name: g.name, emirate: g.emirate, area: g.area || dir?.area || null, website: website ?? null, listedServices: dir?.listedServices ?? [] },
      vehicle: { make: vehicle!.make, model: vehicle!.model, year: vehicle!.year ?? null },
      job: { category: job?.category ?? 'service', service: required, description: job?.description ?? '' },
    };
    const location = [prefs.area, prefs.emirate.replace(/_/g, ' ')].filter(Boolean).join(', ');
    const estimateText = estimateMessage(estimateReq, estimates[g.id] ?? null, location);
    const digits = phone ? phone.replace(/\D/g, '') : '';
    const sendHref = phone
      ? isMobile
        ? `https://wa.me/${digits}?text=${encodeURIComponent(estimateText)}`
        : `sms:${phone}?body=${encodeURIComponent(estimateText)}`
      : null;
    const open = estimateFor === g.id;
    const review = reviews[g.id];
    return (
      <Card key={g.id} className="flex flex-col gap-2">
        <h3 className="font-semibold">{g.name}</h3>
        <p className="text-sm text-muted">
          {g.address || [g.area || dir?.area, g.emirate.replace('_', ' ')].filter(Boolean).join(', ')}
          {d ? ` · ${d}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {hints?.service === 'listed' && (
            <StatusPill tone="good">Listed for this job (directory, unverified)</StatusPill>
          )}
          {hints?.service === 'not_listed' && dir!.listedServices.length > 0 && (
            <StatusPill>Job not listed</StatusPill>
          )}
          {hints?.make === 'listed' && <StatusPill tone="good">Lists {vehicle!.make}</StatusPill>}
        </div>
        {dir && dir.listedServices.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {dir.listedServices.slice(0, 6).map((s) => <StatusPill key={s}>{s}</StatusPill>)}
            {dir.listedServices.length > 6 && <StatusPill>+{dir.listedServices.length - 6}</StatusPill>}
          </div>
        )}
        {g.openingHours && (
          <p className="text-xs text-muted">Opening hours (from listing) — not appointment availability: {g.openingHours}</p>
        )}
        {review ? (
          <div className="rounded-xl bg-peach/60 p-3 text-sm" data-testid="garage-review">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={FIT_LABEL[review.fit].tone}>{FIT_LABEL[review.fit].text}</StatusPill>
              <span className="font-mono text-xs uppercase tracking-wide text-muted">Best for: {review.bestFor}</span>
            </div>
            <p className="mt-1">{review.review}</p>
            <p className="mt-1 text-xs text-muted">Pal's take (AI) from the garage's name, listed services and website — not a customer rating.</p>
          </div>
        ) : reviewsState === 'loading' ? (
          <p className="text-xs text-muted">Pal is checking how well this garage fits your {vehicle!.make}…</p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Button className="min-h-[40px] px-4 text-sm" onClick={() => setEstimateFor(open ? null : g.id)} aria-expanded={open}>
            {open ? 'Hide estimate' : 'Get an estimate'}
          </Button>
          {sendHref && (
            <a className="min-h-[40px] inline-flex items-center rounded-full border border-primary px-3 text-sm font-semibold text-charcoal hover:bg-lime" href={sendHref} target={isMobile ? '_blank' : undefined} rel="noreferrer">
              Send to garage
            </a>
          )}
          {phone && (
            <a className="min-h-[40px] inline-flex items-center rounded-full border border-borderc px-3 text-sm font-medium text-charcoal hover:bg-peach" href={`tel:${phone}`}>Call</a>
          )}
          {isMobile && phone && (
            <a className="min-h-[40px] inline-flex items-center rounded-full border border-borderc px-3 text-sm font-medium text-charcoal hover:bg-peach" href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>
          )}
          {website && (
            <a className="min-h-[40px] inline-flex items-center rounded-full border border-borderc px-3 text-sm font-medium text-charcoal hover:bg-peach" href={website} target="_blank" rel="noreferrer">{domain}</a>
          )}
          <Button variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={() => window.open(mapsUrl, '_blank', 'noopener')}>
            Directions
          </Button>
          <Button variant="ghost" className="min-h-[40px] px-3 text-sm" onClick={() => navigate(`/garage/${g.id}`)}>
            Details
          </Button>
        </div>
        {open && (
          <EstimatePanel
            request={estimateReq}
            onEstimate={(e) => setEstimates((prev) => ({ ...prev, [g.id]: e }))}
            onClose={() => setEstimateFor(null)}
          />
        )}
        <p className="text-xs text-muted">
          Sources: Geoapify{dir && ` + `}<a className="underline" href={dir?.source.url} target="_blank" rel="noreferrer">{dir?.source.name}</a>{dir && ' (directory, unverified)'}
        </p>
      </Card>
    );
  };

  const dirCard = (d: DirectoryListing) => {
    const maps =
      d.mapsUrl ??
      `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${d.name} ${d.area ?? ''} ${d.emirate.replace('_', ' ')}`)}`;
    return (
      <Card key={d.id} className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{d.name}</h3>
          <StatusPill tone="warn">Directory listing — unverified</StatusPill>
        </div>
        <p className="text-sm text-muted">{[d.area, d.address].filter(Boolean).join(', ')}</p>
        {d.listedServices.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {d.listedServices.slice(0, 8).map((s) => (
              <StatusPill key={s}>{s}</StatusPill>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">
          Services as listed by the directory —{' '}
          <a className="underline" href={d.source.url} target="_blank" rel="noreferrer">
            {d.source.name}
          </a>
        </p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {d.phone && (
            <Button variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={() => (window.location.href = `tel:${d.phone}`)}>
              Call
            </Button>
          )}
          {d.website && (
            <Button variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={() => window.open(d.website!, '_blank', 'noopener')}>
              Website
            </Button>
          )}
          {d.directoryProfileUrl && (
            <Button variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={() => window.open(d.directoryProfileUrl!, '_blank', 'noopener')}>
              Directory page
            </Button>
          )}
          <Button variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={() => window.open(maps, '_blank', 'noopener')}>
            Directions
          </Button>
          <Button variant="ghost" className="min-h-[40px] px-3 text-sm" onClick={() => navigate(`/garage/${d.id}`)}>
            Details
          </Button>
        </div>
      </Card>
    );
  };

  const suitableToShow = ranked ? (showMore ? ranked.suitable : ranked.suitable.slice(0, 3)) : [];
  const palHint =
    ranked?.suitable.find((e) => e.cautions.length)?.cautions[0] ??
    (ranked && ranked.suitable.length === 0 ? 'No suitable matches — try widening the travel range or changing timing.' : 'Pick up to three garages and send one request.');

  return (
    <main className="mx-auto max-w-5xl p-4 pb-28 sm:p-6">
      <h1 className="text-2xl font-semibold">
        {source === 'live' ? `Garages near ${prefs.area || prefs.emirate.replace('_', ' ')}` : 'Sample garages'}
      </h1>
      <p className="mt-1 text-muted">
        {vehicle.year === 'unknown' ? '' : `${vehicle.year} `}
        {vehicle.make} {vehicle.model}
        {live.kind === 'done' && live.res.centre && source === 'live'
          ? ` · within ${live.res.radiusKm} km of ${live.res.centre.label}`
          : ''}
      </p>

      {source === 'demo' && (
        <div className="mt-4 flex items-start gap-3">
          <PalAvatar size="sm" state="waiting" />
          <p className="text-sm text-muted">{palHint}</p>
        </div>
      )}

      {source === 'live' && (
        <section className="mt-4 space-y-3">
          {live.kind === 'loading' && <p role="status" className="text-muted">Searching public listings…</p>}
          {live.kind === 'error' && (
            <Card>
              <p className="font-medium">
                {live.code === 'NOT_CONFIGURED' || live.code === 'NOT_FOUND'
                  ? 'Live listings are not connected in this environment.'
                  : 'Live listings could not be loaded right now.'}
              </p>
              <p className="mt-1 text-sm text-muted">{live.message}</p>
              <div className="mt-3 flex gap-2">
                {demo.mode !== 'demo' && (
                  <Button variant="secondary" onClick={() => dispatchDemo({ type: 'enterDemo' })}>
                    Try the demonstration
                  </Button>
                )}
              </div>
            </Card>
          )}
          {live.kind === 'done' && live.res.listings.length === 0 && (
            <Card>
              <p>No public listings found in this area. Try changing the area or widening the travel range.</p>
              <Button variant="secondary" className="mt-3" onClick={() => navigate('/')}>
                Edit search
              </Button>
            </Card>
          )}
          {live.kind === 'done' && live.res.listings.length > 0 && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sortedMerged.map(liveCard)}
              </div>
              <p className="text-xs text-muted">{live.res.attribution} — {live.res.coverageNote}</p>
            </>
          )}
          {live.kind === 'done' && live.res.widened && (
            <p className="text-sm text-muted">{live.res.coverageNote.match(/Widened[^.]*\./)?.[0]}</p>
          )}

          {/* Garage directories — second live source */}
          <section aria-label="Garage directories" className="space-y-3">
            <h2 className="font-semibold">Garage directories</h2>
            {dirs.kind === 'loading' && (
              <p role="status" className="text-sm text-muted">
                Reading directory pages via Context.dev, this can take a minute…
              </p>
            )}

            {dirs.kind === 'done' && (
              <>
                {dirs.res.pending.length > 0 && (
                  <p role="status" className="text-sm text-muted">
                    Still reading {dirs.res.pending.join(', ')}…
                  </p>
                )}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {mergedLive.remainingDirs.map(dirCard)}
                </div>
                {mergedLive.remainingDirs.length === 0 && dirs.res.pending.length === 0 && (
                  <p className="text-sm text-muted">No additional directory listings.</p>
                )}
                {dirs.res.sourceErrors.length > 0 && (
                  <p className="text-xs text-muted">
                    Some directories could not be read ({dirs.res.sourceErrors.map((s) => s.source).join(', ')}).
                  </p>
                )}
                {dirs.res.sources.map((s) => (
                  <p key={s.url} className="text-xs text-muted">
                    Listings from <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.name}</a> via Context.dev, retrieved {formatDateTime(s.retrievedAt)}.
                  </p>
                ))}
              </>
            )}
          </section>
        </section>
      )}

      {source === 'live' && (
        <p className="mt-8 text-center">
          <button
            className="min-h-[48px] px-2 text-[15px] text-muted underline underline-offset-4"
            onClick={() => {
              if (demo.mode !== 'demo') dispatchDemo({ type: 'enterDemo' });
              setSource('demo');
            }}
          >
            See how booking works with sample garages
          </button>
        </p>
      )}
      {source === 'demo' && ranked && (
        <>
          <button
            className="mb-2 min-h-[48px] px-2 text-[15px] text-muted underline underline-offset-4"
            onClick={() => setSource('live')}
          >
            Back to live listings
          </button>
          {!['dubai', 'abu_dhabi', 'sharjah'].includes(prefs.emirate) ? (
            <Card className="mt-4">
              <p className="text-sm">Sample garages exist only in Dubai, Abu Dhabi and Sharjah. Use live listings for this emirate.</p>
            </Card>
          ) : (
          <>
          <section aria-label="Suitable garages" className="mt-4 space-y-3">
            <h2 className="font-semibold">Suitable matches</h2>
            {suitableToShow.length === 0 && (
              <Card>
                <p>
                  No suitable matches for this request. Try changing the job, the timing, or expanding the area —
                  your choices are preserved until you edit them.
                </p>
                <Button variant="secondary" className="mt-3" onClick={() => navigate('/')}>
                  Edit search
                </Button>
              </Card>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {suitableToShow.map((e) => {
                const g = garages.find((x) => x.id === e.garageId)!;
                return demoCard(g, e, true);
              })}
            </div>
            {ranked.suitable.length > 3 && (
              <Button variant="ghost" onClick={() => setShowMore((s) => !s)}>
                {showMore ? 'Show fewer' : `Show more (${ranked.suitable.length - 3})`}
              </Button>
            )}
          </section>

          {ranked.unconfirmed.length > 0 && (
            <section aria-label="Unconfirmed garages" className="mt-6 space-y-3">
              <h2 className="font-semibold">Nearby but unconfirmed</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {ranked.unconfirmed.map((e) => {
                  const g = garages.find((x) => x.id === e.garageId)!;
                  return demoCard(g, e, g.participation.acceptingEnquiries);
                })}
              </div>
            </section>
          )}

          {ranked.excluded.length > 0 && (
            <section aria-label="Not suitable" className="mt-6">
              <button
                className="min-h-[48px] font-medium text-muted underline"
                aria-expanded={showExcluded}
                onClick={() => setShowExcluded((s) => !s)}
              >
                Not suitable for this request ({ranked.excluded.length})
              </button>
              {showExcluded && (
                <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {ranked.excluded.map((e) => {
                    const g = garages.find((x) => x.id === e.garageId)!;
                    return demoCard(g, e, false);
                  })}
                </div>
              )}
            </section>
          )}
          </>
          )}
        </>
      )}

      {source === 'demo' && selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borderc bg-surface p-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <span>{selected.length} selected</span>
            <Button onClick={() => navigate(`/request/new?garages=${selected.join(',')}`)}>
              Request from {selected.length} garage{selected.length > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
