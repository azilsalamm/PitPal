import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type VisionResult,
  type JobCategory,
  type JobRequest,
  type SearchPreferences,
  type ServiceCode,
  type VehicleProfile,
} from '@pitpal/shared';
import { useAppState } from '../state/AppStateContext';
import { Button, Card, Field, inputClass, StatusPill } from '../components/ui';
import { Combobox } from '../components/Combobox';
import { PalPanel } from '../components/pal/PalPanel';
import { SERVICE_LABELS } from '../lib/format';
import { prepareVehiclePhoto } from '../lib/image';
import { ApiError, postJson } from '../lib/api';
import { useMakes, useModels } from '../lib/vehicleCatalog';

const EMIRATES: { value: SearchPreferences['emirate']; label: string }[] = [
  { value: 'dubai', label: 'Dubai' },
  { value: 'abu_dhabi', label: 'Abu Dhabi' },
  { value: 'sharjah', label: 'Sharjah' },
  { value: 'ajman', label: 'Ajman' },
  { value: 'umm_al_quwain', label: 'Umm Al Quwain' },
  { value: 'ras_al_khaimah', label: 'Ras Al Khaimah' },
  { value: 'fujairah', label: 'Fujairah' },
];
const LIMITED = new Set(['ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah']);

const AREA_SUGGESTIONS: Partial<Record<SearchPreferences['emirate'], string[]>> = {
  dubai: ['Al Quoz', 'Deira', 'Al Barsha', 'Ras Al Khor', 'DIP'],
  abu_dhabi: ['Mussafah', 'Al Khalidiyah', 'Musaffah Industrial', 'Mohammed Bin Zayed City'],
  sharjah: ['Industrial Area', 'Al Nahda', 'Al Qasimia', 'Al Saja'],
  ajman: ['Al Jurf', 'Al Nuaimiya', 'Al Rashidiya'],
  umm_al_quwain: ['Old Town', 'Al Salamah', 'Industrial Area'],
  ras_al_khaimah: ['Al Nakheel', 'Al Hamra', 'Al Qusaidat'],
  fujairah: ['Fujairah City', 'Dibba', 'Al Faseel'],
};

const CATEGORY_LABELS: Record<JobCategory, string> = {
  repair: 'Repair — something is broken',
  service: 'Routine service or maintenance',
  restoration: 'Restoration or custom project',
  unsure: 'Not sure what it is',
};

const SERVICE_CHOICES: Record<JobCategory, ServiceCode[]> = {
  repair: ['ac', 'brakes', 'tyres', 'electrical', 'engine_transmission_inspection', 'bodywork_paint', 'interior'],
  service: ['routine_service'],
  restoration: ['full_restoration', 'bodywork_paint', 'interior', 'custom_work'],
  unsure: [],
};

type PhotoState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'result'; result: VisionResult; preview: string }
  | { kind: 'not_configured'; preview: string }
  | { kind: 'error'; message: string; preview?: string };

export default function Find() {
  const { journey, updateJourney } = useAppState();
  const navigate = useNavigate();
  const [guided, setGuided] = useState(true);
  const [stage, setStage] = useState<'A' | 'B' | 'C'>(
    (journey.step as 'A' | 'B' | 'C') ?? 'A',
  );
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'idle' });
  const [photoTouched, setPhotoTouched] = useState(false);
  const requestToken = useRef<string>('');

  const vehicle = journey.vehicle;
  const job = journey.job;
  const prefs = journey.prefs;

  const setVehicle = (patch: Partial<VehicleProfile>) => {
    setPhotoTouched(true);
    updateJourney({
      vehicle: {
        make: '',
        model: '',
        year: 'unknown',
        source: 'manual',
        ...vehicle,
        ...patch,
      },
    });
  };
  const setJob = (patch: Partial<JobRequest>) =>
    updateJourney({ job: { category: 'repair', ...job, ...patch } });
  const setPrefs = (patch: Partial<SearchPreferences>) =>
    updateJourney({
      prefs: {
        emirate: 'dubai',
        area: '',
        timing: 'this_week',
        travel: 'nearby',
        ...prefs,
        ...patch,
      },
    });

  const makeOptions = useMakes();
  const modelOptions = useModels(vehicle?.make ?? '');

  async function onPhoto(file: File) {
    setPhotoTouched(false);
    const token = crypto.randomUUID();
    requestToken.current = token;
    try {
      const { base64, previewUrl } = await prepareVehiclePhoto(file);
      setPhoto({ kind: 'loading' });
      const preview = previewUrl;
      try {
        const res = await postJson<{ requestToken: string; result: VisionResult }>(
          '/api/vision/identify',
          { imageBase64: base64, mimeType: 'image/jpeg', requestToken: token },
        );
        // discard late/stale responses or fields the user already edited
        if (res.requestToken !== requestToken.current || photoTouched) return;
        setPhoto({ kind: 'result', result: res.result, preview });
        const best = res.result.suggestions[0];
        if (
          best &&
          res.result.imageQuality === 'ok' &&
          res.result.suggestions.length === 1 &&
          best.confidence !== 'low'
        ) {
          // single confident suggestion → auto-fill, still editable
          updateJourney({
            vehicle: {
              make: vehicle?.make || best.make,
              model: vehicle?.model || best.model,
              year:
                vehicle?.year !== undefined && vehicle?.year !== 'unknown'
                  ? vehicle.year
                  : 'unknown',
              source: 'photo_confirmed',
              chassisCode: vehicle?.chassisCode,
            },
          });
        }
      } catch (e) {
        if (requestToken.current !== token) return;
        if (e instanceof ApiError && (e.code === 'NOT_CONFIGURED' || e.status === 503)) {
          setPhoto({ kind: 'not_configured', preview });
        } else {
          setPhoto({
            kind: 'error',
            preview,
            message:
              e instanceof ApiError && e.code === 'NOT_FOUND'
                ? "Automatic identification isn't connected in this environment. Enter the details manually."
                : 'The photo could not be checked — enter the details manually or try again.',
          });
        }
      }
    } catch (e) {
      setPhoto({ kind: 'error', message: e instanceof Error ? e.message : 'Could not read that file.' });
    }
  }

  const years = useMemo(() => {
    const now = new Date().getFullYear() + 1;
    return Array.from({ length: 60 }, (_, i) => now - i);
  }, []);

  const vehicleComplete = !!vehicle?.make && !!vehicle?.model;
  const jobComplete = !!job?.category && (job.category === 'unsure' || job.category === 'service' || !!job.service);
  const prefsComplete = !!prefs?.emirate && (!!prefs?.area || !!prefs?.coords);

  const submit = () => {
    updateJourney({ step: 'done' });
    navigate('/results');
  };

  const stageA = (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Your vehicle</h2>

      {/* Photo card */}
      <div className="mb-4 rounded-2xl border border-dashed border-borderc p-4">
        <p className="mb-2 font-medium">Identify from a photo (optional)</p>
        <input
          aria-label="Vehicle photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="min-h-[48px] w-full"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPhoto(f);
          }}
        />
        {photo.kind === 'loading' && <p className="mt-2 text-muted" role="status">Identifying vehicle…</p>}
        {(photo.kind === 'result' || photo.kind === 'error' || photo.kind === 'not_configured') && photo.preview && (
          <img src={photo.preview} alt="Vehicle photo preview" className="mt-2 max-h-40 rounded-xl" />
        )}
        {photo.kind === 'result' && photo.result && (
          <div className="mt-2 space-y-2">
            {photo.result.imageQuality === 'ok' && photo.result.suggestions.length === 1 && photo.result.suggestions[0].confidence !== 'low' && (
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="good">Suggested from photo — please check</StatusPill>
                {(() => {
                  const s = photo.result.suggestions[0];
                  return (
                    <>
                      {s.yearFrom && (
                        <span className="text-sm text-muted">
                          Likely {s.yearFrom}{s.yearTo && s.yearTo !== s.yearFrom ? `–${s.yearTo}` : ''}
                        </span>
                      )}
                      <button
                        type="button"
                        className="text-sm underline text-primary-deep"
                        onClick={() => setPhoto({ kind: 'idle' })}
                      >
                        Clear suggestion
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
            {photo.result.imageQuality === 'ok' && photo.result.suggestions.length > 1 && (
              <>
                <StatusPill tone="good">Suggested from photo — please check</StatusPill>
                <ul className="text-sm">
                  {photo.result.suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="underline text-primary-deep"
                        onClick={() =>
                          updateJourney({
                            vehicle: {
                              make: s.make,
                              model: s.model,
                              year: s.yearFrom ?? 'unknown',
                              source: 'photo_confirmed',
                              chassisCode: vehicle?.chassisCode,
                            },
                          })
                        }
                      >
                        {s.make} {s.model}
                        {s.yearFrom ? ` ${s.yearFrom}${s.yearTo && s.yearTo !== s.yearFrom ? `–${s.yearTo}` : ''}` : ''}
                      </button>
                      <span className="text-muted"> ({s.confidence}){s.note ? ` — ${s.note}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {photo.result.imageQuality === 'no_vehicle' && (
              <p className="text-sm text-muted">No vehicle was detected in that photo — enter the details manually.</p>
            )}
            {photo.result.imageQuality === 'unclear' && (
              <p className="text-sm text-muted">The photo is unclear — please check the details below.</p>
            )}
            {photo.result.multipleVehicles && (
              <StatusPill tone="warn">Multiple vehicles detected — pick the right one</StatusPill>
            )}
          </div>
        )}
        {photo.kind === 'not_configured' && (
          <p className="mt-2 text-muted">Automatic identification isn’t connected in this environment. Enter the details manually.</p>
        )}
        {photo.kind === 'error' && <p className="mt-2 text-accent">{photo.message}</p>}
        {(photo.kind === 'result' || photo.kind === 'error' || photo.kind === 'not_configured') && (
          <div className="mt-2 flex gap-2">
            <Button
              variant="ghost"
              className="min-h-[40px] px-3 text-sm"
              onClick={() => {
                requestToken.current = '';
                setPhoto({ kind: 'idle' });
              }}
            >
              Remove photo
            </Button>
            <label className="inline-flex min-h-[40px] cursor-pointer items-center px-3 text-sm text-primary">
              Retry
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPhoto(f);
                }}
              />
            </label>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Combobox
          label="Make"
          options={[...makeOptions, 'Other / not listed']}
          value={vehicle?.make ?? ''}
          onChange={(make) => setVehicle({ make, model: '' })}
          placeholder="e.g. Toyota"
        />
        <Combobox
          label="Model"
          options={[...modelOptions, 'Other / not listed']}
          value={vehicle?.model ?? ''}
          onChange={(model) => setVehicle({ model })}
          placeholder="e.g. Corolla"
        />
        <Field label="Year" htmlFor="year">
          <select
            id="year"
            className={inputClass}
            value={vehicle?.year === 'unknown' || vehicle?.year === undefined ? 'unknown' : String(vehicle.year)}
            onChange={(e) =>
              setVehicle({ year: e.target.value === 'unknown' ? 'unknown' : Number(e.target.value) })
            }
          >
            <option value="unknown">Not sure</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Chassis code (optional)" htmlFor="chassis">
          <input
            id="chassis"
            className={inputClass}
            value={vehicle?.chassisCode ?? ''}
            onChange={(e) => setVehicle({ chassisCode: e.target.value || undefined })}
            placeholder="e.g. KE70"
          />
        </Field>
      </div>
    </Card>
  );

  const stageB = (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">What does the car need?</h2>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Job type">
        {(Object.keys(CATEGORY_LABELS) as JobCategory[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={job?.category === c}
            className={`min-h-[48px] rounded-2xl border px-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              job?.category === c ? 'border-primary bg-primary/5' : 'border-borderc'
            }`}
            onClick={() => setJob({ category: c, service: undefined })}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      {job?.category === 'unsure' && (
        <p className="mt-3 text-sm text-muted">
          What did you notice? PitPal will route this to a general inspection.
        </p>
      )}
      {job && SERVICE_CHOICES[job.category].length > 1 && (
        <div className="mt-4">
          <p className="mb-2 font-medium">Service</p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_CHOICES[job.category].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={job.service === s}
                className={`min-h-[48px] rounded-2xl border px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  job.service === s ? 'border-primary bg-primary/5' : 'border-borderc'
                }`}
                onClick={() => setJob({ service: s })}
              >
                {SERVICE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}
      {job && (
        <Field label="Anything else we should know? (optional)" htmlFor="desc">
          <textarea
            id="desc"
            className={`${inputClass} mt-1 min-h-[96px] py-2`}
            value={job.description ?? ''}
            onChange={(e) => setJob({ description: e.target.value || undefined })}
          />
        </Field>
      )}
    </Card>
  );

  const stageC = (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Where and when?</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Emirate" htmlFor="emirate">
          <select
            id="emirate"
            className={inputClass}
            value={prefs?.emirate ?? 'dubai'}
            onChange={(e) => setPrefs({ emirate: e.target.value as SearchPreferences['emirate'] })}
          >
            {EMIRATES.filter((e) => !LIMITED.has(e.value)).map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
            <optgroup label="Limited coverage">
              {EMIRATES.filter((e) => LIMITED.has(e.value)).map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Area" htmlFor="area">
          <input
            id="area"
            className={inputClass}
            list="area-suggestions"
            value={prefs?.area ?? ''}
            onChange={(e) => setPrefs({ area: e.target.value })}
            placeholder="e.g. Al Khalidiyah"
          />
          <datalist id="area-suggestions">
            {(AREA_SUGGESTIONS[prefs?.emirate ?? 'dubai'] ?? []).map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className="mt-3">
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                setPrefs({ coords: { lat: pos.coords.latitude, lon: pos.coords.longitude } }),
              () => setPrefs({ coords: undefined }),
            );
          }}
        >
          Use my location
        </Button>
        {prefs?.coords && (
          <span className="ml-3 text-sm text-muted">
            Location set ({prefs.coords.lat.toFixed(3)}, {prefs.coords.lon.toFixed(3)})
          </span>
        )}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Timing" htmlFor="timing">
          <select
            id="timing"
            className={inputClass}
            value={prefs?.timing ?? 'this_week'}
            onChange={(e) => setPrefs({ timing: e.target.value as SearchPreferences['timing'] })}
          >
            <option value="today">Today</option>
            <option value="this_week">This week</option>
            <option value="flexible">Flexible</option>
          </select>
        </Field>
        <Field
          label="Travel"
          htmlFor="travel"
          hint={prefs?.undrivable ? 'PitPal does not arrange recovery.' : undefined}
        >
          <select
            id="travel"
            className={inputClass}
            value={prefs?.travel ?? 'nearby'}
            onChange={(e) => setPrefs({ travel: e.target.value as SearchPreferences['travel'] })}
          >
            <option value="nearby">Nearby (within ~15 km)</option>
            <option value="emirate">Within my emirate</option>
            <option value="uae">Anywhere in the UAE</option>
          </select>
        </Field>
        <Field label="Priority (optional)" htmlFor="priority">
          <select
            id="priority"
            className={inputClass}
            value={prefs?.priority ?? ''}
            onChange={(e) =>
              setPrefs({ priority: (e.target.value || undefined) as SearchPreferences['priority'] })
            }
          >
            <option value="">No priority</option>
            <option value="earliest">Earliest available</option>
            <option value="lower_first_visit_cost">Lower first-visit cost</option>
            <option value="relevant_experience">Relevant experience</option>
          </select>
        </Field>
      </div>
      <label className="mt-4 flex min-h-[48px] items-center gap-2">
        <input
          type="checkbox"
          className="h-5 w-5 accent-primary"
          checked={!!prefs?.undrivable}
          onChange={(e) => setPrefs({ undrivable: e.target.checked || undefined })}
        />
        The car can’t be driven
      </label>
      {prefs?.undrivable && (
        <p className="text-sm text-muted">PitPal does not arrange recovery.</p>
      )}
    </Card>
  );

  const summary = (
    <Card className="h-fit">
      <h2 className="mb-2 font-semibold">Summary</h2>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-muted">Vehicle</dt>
          <dd>
            {vehicle?.make || vehicle?.model
              ? `${vehicle.year === 'unknown' ? '' : `${vehicle?.year ?? ''} `}${vehicle?.make} ${vehicle?.model}${vehicle?.chassisCode ? ` (${vehicle.chassisCode})` : ''}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Job</dt>
          <dd>
            {job
              ? `${CATEGORY_LABELS[job.category]}${job.service ? ` — ${SERVICE_LABELS[job.service]}` : ''}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Location</dt>
          <dd>{prefs ? `${prefs.area}, ${prefs.emirate.replace('_', ' ')}` : '—'}</dd>
        </div>
      </dl>
      <Button
        className="mt-4 w-full"
        disabled={!(vehicleComplete && jobComplete && prefsComplete)}
        onClick={submit}
      >
        Find garages
      </Button>
    </Card>
  );

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <PalPanel
        className="mb-4"
        prompt={
          stage === 'A'
            ? 'Hi, I’m Pal. Tell me about your car — or snap a photo and I’ll suggest the details.'
            : stage === 'B'
              ? 'What’s going on with it? If you’re not sure, choose “Not sure” — that routes to a general inspection.'
              : 'Almost done. Where is the car, and how far can it travel?'
        }
        state={vehicleComplete ? (jobComplete ? 'done' : 'waiting') : 'welcome'}
        size="sm"
      />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-strong">
          Let’s find the right garage for your car.
        </h1>
        <button
          className="min-h-[48px] px-3 text-primary underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setGuided((g) => !g)}
        >
          {guided ? 'Use standard form' : 'Use guided steps'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {guided ? (
            <>
              {stage === 'A' && stageA}
              {stage === 'B' && stageB}
              {stage === 'C' && stageC}
              <div className="flex gap-2">
                {stage !== 'A' && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const prev = stage === 'C' ? 'B' : 'A';
                      setStage(prev);
                      updateJourney({ step: prev });
                    }}
                  >
                    Back
                  </Button>
                )}
                {stage !== 'C' ? (
                  <Button
                    onClick={() => {
                      const next = stage === 'A' ? 'B' : 'C';
                      setStage(next);
                      updateJourney({ step: next });
                    }}
                    disabled={stage === 'A' ? !vehicleComplete : !jobComplete}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button disabled={!(vehicleComplete && jobComplete && prefsComplete)} onClick={submit}>
                    Find garages
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              {stageA}
              {stageB}
              {stageC}
              <Button disabled={!(vehicleComplete && jobComplete && prefsComplete)} onClick={submit}>
                Find garages
              </Button>
            </>
          )}
        </div>
        <aside className="hidden lg:block">{summary}</aside>
      </div>
    </main>
  );
}
