import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  directoryHints,
  requiredService,
  uaeDateString,
  type DirectoryListing,
  type EvidenceKind,
  type Garage,
  type GarageEnrichment,
} from '@pitpal/shared';
import { useAppState } from '../state/AppStateContext';
import { Button, Card, StatusPill } from '../components/ui';
import { PriceScopeTable } from '../components/PriceScopeTable';
import { AVAILABILITY_LABELS, formatAed, formatDateTime, SERVICE_LABELS } from '../lib/format';
import { getDirListing, getLiveListing } from '../lib/dirStore';
import { ApiError, postJson } from '../lib/api';

const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  website_listed: 'Listed on the garage’s website',
  garage_provided: 'Provided by the garage',
  work_example: 'Supporting work example',
  confirmed_for_request: 'Confirmed for your request',
};

function DirDetail({ d }: { d: DirectoryListing }) {
  const navigate = useNavigate();
  const [enrich, setEnrich] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; e: GarageEnrichment } | { kind: 'error'; msg: string }
  >({ kind: 'idle' });
  const maps =
    d.mapsUrl ??
    `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${d.name} ${d.area ?? ''} ${d.emirate.replace('_', ' ')}`)}`;

  const extract = async (url: string) => {
    setEnrich({ kind: 'loading' });
    try {
      const r = await postJson<{ enrichment: GarageEnrichment }>('/api/enrichment/extract', { url });
      setEnrich({ kind: 'done', e: r.enrichment });
    } catch (e) {
      setEnrich({ kind: 'error', msg: e instanceof ApiError ? e.message : 'Could not read that website.' });
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <Button variant="ghost" className="mb-2 min-h-[40px] px-2" onClick={() => navigate(-1)}>← Back</Button>
      <div className="flex items-start justify-between gap-2">
        <h1>{d.name}</h1>
        <StatusPill tone="warn">Directory listing — unverified</StatusPill>
      </div>
      <p className="text-muted">{[d.area, d.address, d.emirate.replace('_', ' ')].filter(Boolean).join(', ')}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {d.phone && <Button variant="secondary" onClick={() => (window.location.href = `tel:${d.phone}`)}>Call</Button>}
        {d.website && <Button variant="secondary" onClick={() => window.open(d.website!, '_blank', 'noopener')}>Website</Button>}
        {d.directoryProfileUrl && (
          <Button variant="secondary" onClick={() => window.open(d.directoryProfileUrl!, '_blank', 'noopener')}>Directory page</Button>
        )}
        <Button variant="secondary" onClick={() => window.open(maps, '_blank', 'noopener')}>Directions</Button>
      </div>

      {d.website && (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => void extract(d.website!)}>
            Check the garage’s website
          </Button>
        </div>
      )}
      {enrich.kind === 'loading' && <p className="mt-3 text-sm text-muted" role="status">Reading the garage’s website via Context.dev…</p>}
      {enrich.kind === 'error' && <p className="mt-3 text-sm text-red-800">{enrich.msg}</p>}
      {enrich.kind === 'done' && <EnrichmentCard e={enrich.e} />}

      <Card className="mt-6">
        <h2 className="mb-2 font-semibold">Services as listed by the directory</h2>
        {d.listedServices.length ? (
          <div className="flex flex-wrap gap-1">
            {d.listedServices.map((s) => <StatusPill key={s}>{s}</StatusPill>)}
          </div>
        ) : (
          <p className="text-sm text-muted">No services were listed.</p>
        )}
        <p className="mt-2 text-xs text-muted">
          Listings from{' '}
          <a className="underline" href={d.source.url} target="_blank" rel="noreferrer">{d.source.name}</a>{' '}
          via Context.dev, retrieved {formatDateTime(d.retrievedAt)}. Unverified third-party data.
        </p>
      </Card>
    </main>
  );
}

function EnrichmentCard({ e }: { e: GarageEnrichment }) {
  const empty =
    !e.services.length && !e.makes.length && !e.models.length &&
    !e.restorationExamples.length && !e.publishedFees.length &&
    !e.phone && !e.whatsapp && !e.address && !e.openingHours;
  return (
    <Card className="mt-3" elevated>
      <p className="text-xs text-muted">
        From the garage’s own website · retrieved {formatDateTime(e.retrievedAt)} · fact-checked by Context.dev ·{' '}
        <a className="underline" href={e.sourceUrl} target="_blank" rel="noreferrer">source</a>
      </p>
      {empty ? (
        <p className="mt-2 text-sm">No published details found.</p>
      ) : (
        <dl className="mt-2 space-y-2 text-sm">
          {e.services.length > 0 && <div><dt className="font-medium">Services</dt><dd>{e.services.join(', ')}</dd></div>}
          {e.makes.length > 0 && <div><dt className="font-medium">Makes</dt><dd>{e.makes.join(', ')}</dd></div>}
          {e.models.length > 0 && <div><dt className="font-medium">Models</dt><dd>{e.models.join(', ')}</dd></div>}
          {e.restorationExamples.length > 0 && (
            <div>
              <dt className="font-medium">Restoration examples</dt>
              <dd>{e.restorationExamples.map((r) => [r.title, r.vehicle].filter(Boolean).join(' — ')).join('; ')}</dd>
            </div>
          )}
          {e.publishedFees.length > 0 && (
            <div>
              <dt className="font-medium">Published fees</dt>
              <dd>
                {e.publishedFees
                  .map((f) => `${f.service}: ${f.amountAed != null ? `${f.amountAed} AED` : 'price not stated'}${f.scopeNote ? ` (${f.scopeNote})` : ''}`)
                  .join('; ')}
              </dd>
            </div>
          )}
          {e.phone && <div><dt className="font-medium">Phone</dt><dd>{e.phone}</dd></div>}
          {e.whatsapp && <div><dt className="font-medium">WhatsApp</dt><dd>{e.whatsapp}</dd></div>}
          {e.address && <div><dt className="font-medium">Address</dt><dd>{e.address}</dd></div>}
          {e.openingHours && <div><dt className="font-medium">Opening hours</dt><dd>{e.openingHours} <em>(not appointment availability)</em></dd></div>}
        </dl>
      )}
    </Card>
  );
}

function PublicDetail({ g }: { g: Garage }) {
  const navigate = useNavigate();
  const { journey } = useAppState();
  const [enrich, setEnrich] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; e: GarageEnrichment } | { kind: 'error'; msg: string }
  >({ kind: 'idle' });
  const autoRun = useRef(false);
  const [candidates, setCandidates] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; list: { url: string; title: string; matchedOn: string }[] } | { kind: 'error'; msg: string }
  >({ kind: 'idle' });

  const mapsUrl = g.coords
    ? `https://www.google.com/maps/dir/?api=1&destination=${g.coords.lat},${g.coords.lon}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${g.name} ${g.area}`)}`;

  const extract = async (url: string) => {
    setEnrich({ kind: 'loading' });
    try {
      const r = await postJson<{ enrichment: GarageEnrichment }>('/api/enrichment/extract', { url });
      setEnrich({ kind: 'done', e: r.enrichment });
    } catch (e) {
      setEnrich({ kind: 'error', msg: e instanceof ApiError ? e.message : 'Could not read that website.' });
    }
  };

  const findWebsite = async () => {
    setCandidates({ kind: 'loading' });
    try {
      const r = await postJson<{ candidates: { url: string; title: string; matchedOn: string }[] }>(
        '/api/enrichment/find-website',
        { name: g.name, area: g.area, emirate: g.emirate.replace('_', ' ') },
      );
      setCandidates({ kind: 'done', list: r.candidates });
    } catch (e) {
      setCandidates({ kind: 'error', msg: e instanceof ApiError ? e.message : 'Search failed.' });
    }
  };

  const required = journey.job ? requiredService(journey.job) : 'general_inspection';

  useEffect(() => {
    if (g.website && !autoRun.current) {
      autoRun.current = true;
      void extract(g.website);
    }
  }, [g.id]);

  const isMobilePhone = g.phone ? /^\+9715/.test(g.phone.replace(/\s/g, '')) : false;

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <Button variant="ghost" className="mb-2 min-h-[40px] px-2" onClick={() => navigate(-1)}>← Back</Button>
      <div className="flex items-start justify-between gap-2">
        <h1>{g.name}</h1>
        <StatusPill>Public listing</StatusPill>
      </div>
      <p className="text-muted">{[g.area, g.emirate.replace('_', ' ')].filter(Boolean).join(', ')}{g.address ? ` — ${g.address}` : ''}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {g.phone && <Button variant="secondary" onClick={() => (window.location.href = `tel:${g.phone}`)}>Call</Button>}
        {isMobilePhone && g.phone && (
          <Button variant="secondary" onClick={() => window.open(`https://wa.me/${g.phone!.replace(/\D/g, '')}`, '_blank', 'noopener')}>WhatsApp</Button>
        )}
        {g.website && <Button variant="secondary" onClick={() => window.open(g.website, '_blank', 'noopener')}>Website</Button>}
        <Button variant="secondary" onClick={() => window.open(mapsUrl, '_blank', 'noopener')}>Directions</Button>
      </div>

      <div className="mt-4">
        {g.website ? (
          <Button onClick={() => void extract(g.website!)}>Check the garage’s website</Button>
        ) : (
          <Button variant="secondary" onClick={() => void findWebsite()}>Look for the garage’s website</Button>
        )}
      </div>
      {enrich.kind === 'loading' && <p className="mt-3 text-sm text-muted" role="status">Reading the garage’s website via Context.dev…</p>}
      {enrich.kind === 'error' && <p className="mt-3 text-sm text-red-800">{enrich.msg}</p>}
      {enrich.kind === 'done' && <EnrichmentCard e={enrich.e} />}

      {candidates.kind === 'loading' && <p className="mt-3 text-sm text-muted" role="status">Searching the web for this garage…</p>}
      {candidates.kind === 'error' && <p className="mt-3 text-sm text-red-800">{candidates.msg}</p>}
      {candidates.kind === 'done' && (
        <Card className="mt-3">
          <p className="text-sm text-muted">Found by web search — confirm this is the right garage.</p>
          {candidates.list.length === 0 ? (
            <p className="mt-2 text-sm">No matching website found.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {candidates.list.map((c) => (
                <li key={c.url} className="flex flex-wrap items-center justify-between gap-2">
                  <a className="text-primary-deep underline" href={c.url} target="_blank" rel="noreferrer">{c.title}</a>
                  <Button variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={() => void extract(c.url)}>
                    Read this site
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="mt-6 space-y-4">
        <Card>
          <h2 className="mb-2 font-semibold">About this listing</h2>
          <p className="text-sm text-muted">
            Real garage from public map data. Ask for an estimate by WhatsApp, SMS or phone — the
            garage replies to you directly.
          </p>
          {journey.vehicle && (
            <p className="mt-2 text-sm text-muted">
              {(() => {
                const h = directoryHints(g.specialities, journey.vehicle!.make, required);
                return h.service === 'listed' ? 'Listed for this job (directory, unverified).' : '';
              })()}
            </p>
          )}
          {g.openingHours && (
            <p className="mt-2 text-sm text-muted">
              Opening hours: {g.openingHours}
              <br />
              <em>Opening hours are not appointment availability.</em>
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}

function DemoDetail({ g }: { g: Garage }) {
  const navigate = useNavigate();
  const now = new Date();
  const av = g.availability;
  const availLabel = !av
    ? 'Availability needs confirmation'
    : av.capacity === 'not_accepting'
      ? 'Not accepting'
      : av.validOnUaeDate !== uaeDateString(now)
        ? 'Availability needs confirmation'
        : AVAILABILITY_LABELS[av.capacity === 'accepting_today' ? 'today' : 'this_week'];
  const canRequest = g.participation.acceptingEnquiries && g.participation.status !== 'none';
  const mapsUrl = g.coords
    ? `https://www.google.com/maps/dir/?api=1&destination=${g.coords.lat},${g.coords.lon}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${g.name} ${g.area}`)}`;
  const isMobilePhone = g.phone ? /^\+9715/.test(g.phone.replace(/\s/g, '')) : false;

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <Button variant="ghost" className="mb-2 min-h-[40px] px-2" onClick={() => navigate(-1)}>← Back</Button>
      <div className="flex items-start justify-between gap-2">
        <h1>{g.name}</h1>
        {g.listingType === 'demo_fictional' && <StatusPill tone="demo">Sample garage — demo data</StatusPill>}
        {g.listingType === 'public_listing' && <StatusPill>Public listing</StatusPill>}
      </div>
      <p className="text-muted">{g.area}, {g.emirate.replace('_', ' ')}{g.address ? ` — ${g.address}` : ''}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {g.phone && <Button variant="secondary" onClick={() => (window.location.href = `tel:${g.phone}`)}>Call</Button>}
        {isMobilePhone && g.phone && (
          <Button variant="secondary" onClick={() => window.open(`https://wa.me/${g.phone!.replace(/\D/g, '')}`, '_blank', 'noopener')}>WhatsApp</Button>
        )}
        {g.website && <Button variant="secondary" onClick={() => window.open(g.website, '_blank', 'noopener')}>Website</Button>}
        <Button variant="secondary" onClick={() => window.open(mapsUrl, '_blank', 'noopener')}>Directions</Button>
        {canRequest && <Button onClick={() => navigate('/results')}>Request this garage</Button>}
      </div>
      {g.listingType === 'demo_fictional' && (
        <p className="mt-2 text-xs text-muted">Demo garages are fictional — website enrichment doesn’t apply to them.</p>
      )}

      <div className="mt-6 space-y-4">
        <Card>
          <h2 className="mb-2 font-semibold">Vehicles supported</h2>
          <p>
            {g.makeSupport.mode === 'all' ? 'All makes'
              : g.makeSupport.mode === 'list' ? g.makeSupport.makes.join(', ') : 'Not stated'}
          </p>
          {g.restrictions.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-accent">
              {g.restrictions.map((r, i) => <li key={i}>{r.note}</li>)}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Services</h2>
          <div className="flex flex-wrap gap-2">
            {g.services.map((s) => <StatusPill key={s}>{SERVICE_LABELS[s]}</StatusPill>)}
          </div>
          {g.specialities.length > 0 && (
            <p className="mt-2 text-sm text-muted">Specialities: {g.specialities.join(', ')}</p>
          )}
        </Card>

        {g.evidence.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Supporting evidence</h2>
            <ul className="space-y-2 text-sm">
              {g.evidence.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">{EVIDENCE_LABELS[e.kind]}:</span> {e.excerpt}
                  {e.isSample && <span className="text-accent"> (sample)</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <h2 className="mb-2 font-semibold">Availability</h2>
          <p>{availLabel}</p>
          {av && (
            <p className="mt-1 text-sm text-muted">
              Declared {formatDateTime(av.declaredAt)}{av.note ? ` — ${av.note}` : ''}
            </p>
          )}
          {g.openingHours && (
            <p className="mt-2 text-sm text-muted">
              Opening hours: {g.openingHours}
              <br />
              <em>Opening hours are not appointment availability.</em>
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Price scope</h2>
          <PriceScopeTable prices={g.prices} />
          {g.prices.length > 0 && (
            <p className="mt-2 text-sm text-muted">Relevant starting price: {formatAed(g.prices[0]?.amountAed)}</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Participation</h2>
          <p className="text-sm">
            {g.participation.status === 'demo_inbox'
              ? 'Demo garage — requests go to a simulated inbox in this browser.'
              : g.participation.status === 'participating'
                ? 'This garage receives PitPal enquiries.'
                : 'Public listing — PitPal cannot send enquiries to this garage.'}
          </p>
        </Card>
      </div>
    </main>
  );
}

export default function GarageDetail() {
  const { id } = useParams();
  const { garages } = useAppState();
  const navigate = useNavigate();

  if (id?.startsWith('dir:')) {
    const d = getDirListing(id);
    if (!d) {
      return (
        <main className="mx-auto max-w-3xl p-6">
          <p className="text-muted">Directory listing not found in this session — go back to results.</p>
          <Button className="mt-4" onClick={() => navigate('/results')}>Back to results</Button>
        </main>
      );
    }
    return <DirDetail d={d} />;
  }

  const g = garages.find((x) => x.id === id);
  // live public listings may not be in the demo directory — check a light store too
  if (!g) {
    const fromLive = getLiveListing(id ?? '');
    if (fromLive) return <PublicDetail g={fromLive} />;
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-muted">Garage not found.</p>
        <Button className="mt-4" onClick={() => navigate('/results')}>Back to results</Button>
      </main>
    );
  }
  if (g.listingType === 'public_listing') return <PublicDetail g={g} />;
  return <DemoDetail g={g} />;
}
