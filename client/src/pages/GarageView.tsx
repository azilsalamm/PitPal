import { useMemo, useState } from 'react';
import {
  PriceType,
  ServiceCode,
  uaeDateString,
  uaeLocalToIso,
  type Offer,
  type ProviderEnquiry,
} from '@pitpal/shared';
import { DemoError } from '@pitpal/shared';
import { useAppState } from '../state/AppStateContext';
import { Button, Card, Field, inputClass, StatusPill } from '../components/ui';
import { elapsed, ENQUIRY_STATUS_LABELS, SERVICE_LABELS } from '../lib/format';

const SERVICES = ServiceCode.options;

function EnquiryCard({
  enq,
  requestVehicle,
  onOffer,
  onQuestion,
  onDecline,
}: {
  enq: ProviderEnquiry;
  requestVehicle: string;
  onOffer: () => void;
  onQuestion: () => void;
  onDecline: () => void;
}) {
  const { demo } = useAppState();
  const req = demo.requests[enq.requestId];
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{requestVehicle}</p>
          <p className="text-sm text-muted">
            {req ? SERVICE_LABELS[req.job.service ?? 'general_inspection'] : ''} · {elapsed(enq.createdAt)}
          </p>
        </div>
        <StatusPill tone="neutral">{ENQUIRY_STATUS_LABELS[enq.status]}</StatusPill>
      </div>
      {req?.job.description && <p className="mt-2 text-sm">{req.job.description}</p>}
      {enq.question && (
        <p className="mt-2 text-sm"><strong>You asked:</strong> {enq.question}</p>
      )}
      {enq.answer && (
        <p className="mt-1 text-sm"><strong>Answer:</strong> {enq.answer}</p>
      )}
      {(enq.status === 'waiting' || enq.status === 'info_needed' || enq.status === 'offer_received') && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" className="min-h-[44px]" onClick={onOffer}>Send offer</Button>
          {enq.status !== 'info_needed' && (
            <Button variant="ghost" className="min-h-[44px]" onClick={onQuestion}>Ask a question</Button>
          )}
          <Button variant="danger" className="min-h-[44px]" onClick={onDecline}>Decline</Button>
        </div>
      )}
    </Card>
  );
}

export default function GarageView() {
  const { demo, dispatchDemo, garages } = useAppState();
  const [garageId, setGarageId] = useState(garages[0]?.id ?? '');
  const garage = garages.find((g) => g.id === garageId) ?? garages[0];
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [questionFor, setQuestionFor] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // offer form state
  const todayUae = uaeDateString(new Date());
  const [oFirstStep, setOFirstStep] = useState<Offer['firstStep']>('inspection');
  const [oDate, setODate] = useState(todayUae);
  const [oTime, setOTime] = useState('10:00');
  const [oPriceType, setOPriceType] = useState<PriceType>('inspection_fee');
  const [oMin, setOMin] = useState('150');
  const [oMax, setOMax] = useState('');
  const [oIncl, setOIncl] = useState('');
  const [oExcl, setOExcl] = useState('');
  const [oTax, setOTax] = useState<'included' | 'excluded' | 'unknown'>('unknown');
  const [oCredit, setOCredit] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [oExpiryDate, setOExpiryDate] = useState(todayUae);
  const [oExpiryTime, setOExpiryTime] = useState('18:00');

  const enquiries = useMemo(
    () =>
      Object.values(demo.enquiries)
        .filter((e) => e.garageId === garage?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [demo.enquiries, garage?.id],
  );
  const groups = {
    New: enquiries.filter((e) => e.status === 'waiting' && !e.answer),
    'Needs response': enquiries.filter((e) => e.status === 'info_needed' || (e.status === 'waiting' && e.answer)),
    Confirmed: enquiries.filter((e) => e.status === 'confirmed'),
    Other: enquiries.filter((e) => ['declined', 'expired', 'superseded', 'cancelled'].includes(e.status)),
  };

  const run = (fn: () => void) => {
    try {
      fn();
      setErr(null);
    } catch (e) {
      setErr(e instanceof DemoError ? `${e.message} (${e.code})` : 'Something went wrong');
    }
  };

  const sendOffer = (enquiryId: string) => {
    run(() => {
      dispatchDemo({
        type: 'sendOffer',
        enquiryId,
        offerId: crypto.randomUUID(),
        nowIso: new Date().toISOString(),
        offer: {
          capabilityConfirmed: true,
          firstStep: oFirstStep,
          appointmentAt: uaeLocalToIso(oDate, oTime),
          expiresAt: uaeLocalToIso(oExpiryDate, oExpiryTime),
          price: {
            id: `offer_price_${crypto.randomUUID()}`,
            service: 'general_inspection',
            scope: 'Offer from garage (demo)',
            type: oPriceType,
            amountAed: oMin ? { min: Number(oMin), ...(oMax ? { max: Number(oMax) } : {}) } : undefined,
            inclusions: oIncl.split(',').map((s) => s.trim()).filter(Boolean),
            exclusions: oExcl.split(',').map((s) => s.trim()).filter(Boolean),
            tax: oTax,
            inspectionFeeCredited: oCredit,
            isSample: true,
          },
        },
      });
      // tick immediately after sendOffer so expiry state stays fresh
      dispatchDemo({ type: 'tick', nowIso: new Date().toISOString() });
      setOfferFor(null);
    });
  };

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1>Demo garage view</h1>
        <StatusPill tone="demo">this browser only</StatusPill>
      </div>
      <p className="mt-1 text-sm text-muted">
        Labelled demo tool — this is not real authorisation.
      </p>

      <Field label="Garage" htmlFor="gv-garage">
        <select
          id="gv-garage"
          className={inputClass}
          value={garage?.id}
          onChange={(e) => setGarageId(e.target.value)}
        >
          {garages.map((g) => (
            <option key={g.id} value={g.id}>{g.name} — {g.area}</option>
          ))}
        </select>
      </Field>
      {err && <p className="mt-2 text-sm text-red-800" role="alert">{err}</p>}

      {/* Inbox */}
      <section className="mt-6 space-y-4">
        {(['New', 'Needs response', 'Confirmed', 'Other'] as const).map((g) =>
          groups[g].length ? (
            <div key={g}>
              <h2 className="mb-2 text-[24px]">{g}</h2>
              <div className="space-y-3">
                {groups[g].map((e) => {
                  const req = demo.requests[e.requestId];
                  return (
                    <EnquiryCard
                      key={e.id}
                      enq={e}
                      requestVehicle={req ? `${req.vehicle.make} ${req.vehicle.model} ${req.vehicle.year !== 'unknown' ? req.vehicle.year : ''}` : ''}
                      onOffer={() => setOfferFor(e.id)}
                      onQuestion={() => { setQuestionFor(e.id); setQuestion(''); }}
                      onDecline={() => { setDeclineFor(e.id); setDeclineReason(''); }}
                    />
                  );
                })}
              </div>
            </div>
          ) : null,
        )}
        {enquiries.length === 0 && <p className="text-muted">No enquiries for this garage yet.</p>}
      </section>

      {/* Profile edits */}
      <section className="mt-8">
        <h2 className="mb-2 text-[24px]">Garage profile (demo)</h2>
        <Card className="space-y-4">
          <div>
            <p className="mb-1 font-medium">Services</p>
            <div className="flex flex-wrap gap-2">
              {SERVICES.map((s) => {
                const on = garage.services.includes(s);
                return (
                  <button
                    key={s}
                    aria-pressed={on}
                    className={`min-h-[44px] rounded-full border px-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      on ? 'border-2 border-strong bg-lime' : 'border-borderc'
                    }`}
                    onClick={() =>
                      run(() =>
                        dispatchDemo({
                          type: 'updateProfile',
                          garageId: garage.id,
                          patch: {
                            services: on
                              ? garage.services.filter((x) => x !== s)
                              : [...garage.services, s],
                          },
                        }),
                      )
                    }
                  >
                    {SERVICE_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex min-h-[48px] items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={garage.participation.acceptingEnquiries}
              onChange={(e) =>
                run(() =>
                  dispatchDemo({
                    type: 'updateProfile',
                    garageId: garage.id,
                    patch: { acceptingEnquiries: e.target.checked },
                  }),
                )
              }
            />
            Accepting enquiries
          </label>
          <Field label="Current capacity" htmlFor="gv-cap">
            <select
              id="gv-cap"
              className={inputClass}
              value={garage.availability?.capacity ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                run(() =>
                  dispatchDemo({
                    type: 'updateProfile',
                    garageId: garage.id,
                    patch: {
                      availability: v
                        ? {
                            capacity: v as NonNullable<typeof garage.availability>['capacity'],
                            declaredAt: new Date().toISOString(),
                            validOnUaeDate: todayUae,
                          }
                        : undefined,
                    },
                  }),
                );
              }}
            >
              <option value="">No declaration</option>
              <option value="accepting_today">Accepting today</option>
              <option value="accepting_this_week">Accepting this week</option>
              <option value="limited">Limited</option>
              <option value="not_accepting">Not accepting</option>
            </select>
          </Field>
          <p className="text-sm text-muted">Profile edits affect future matching only — never accepted appointments.</p>
        </Card>
      </section>

      {/* Offer form (inline panel) */}
      {offerFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Send offer">
          <button className="absolute inset-0 bg-charcoal/40" onClick={() => setOfferFor(null)} aria-label="Cancel" />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-5 shadow-[0_8px_24px_rgba(0,0,0,.12)]">
            <h2 className="mb-3 text-[24px]">Send offer</h2>
            <div className="space-y-3">
              <Field label="First step" htmlFor="of-step">
                <select id="of-step" className={inputClass} value={oFirstStep} onChange={(e) => setOFirstStep(e.target.value as Offer['firstStep'])}>
                  <option value="inspection">Inspection</option>
                  <option value="defined_service">Defined service</option>
                  <option value="restoration_consultation">Restoration consultation</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Appointment date (UAE)" htmlFor="of-date">
                  <input id="of-date" type="date" className={inputClass} value={oDate} onChange={(e) => setODate(e.target.value)} />
                </Field>
                <Field label="Time" htmlFor="of-time">
                  <input id="of-time" type="time" className={inputClass} value={oTime} onChange={(e) => setOTime(e.target.value)} />
                </Field>
              </div>
              <Field label="Price type" htmlFor="of-ptype">
                <select id="of-ptype" className={inputClass} value={oPriceType} onChange={(e) => setOPriceType(e.target.value as PriceType)}>
                  {PriceType.options.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount min (AED)" htmlFor="of-min">
                  <input id="of-min" type="number" min="0" className={inputClass} value={oMin} onChange={(e) => setOMin(e.target.value)} />
                </Field>
                <Field label="Max (optional)" htmlFor="of-max">
                  <input id="of-max" type="number" min="0" className={inputClass} value={oMax} onChange={(e) => setOMax(e.target.value)} />
                </Field>
              </div>
              <Field label="Inclusions (comma separated)" htmlFor="of-incl">
                <input id="of-incl" className={inputClass} value={oIncl} onChange={(e) => setOIncl(e.target.value)} />
              </Field>
              <Field label="Exclusions (comma separated)" htmlFor="of-excl">
                <input id="of-excl" className={inputClass} value={oExcl} onChange={(e) => setOExcl(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tax" htmlFor="of-tax">
                  <select id="of-tax" className={inputClass} value={oTax} onChange={(e) => setOTax(e.target.value as typeof oTax)}>
                    <option value="unknown">Unknown</option>
                    <option value="included">Included</option>
                    <option value="excluded">Excluded</option>
                  </select>
                </Field>
                <Field label="Inspection fee credited?" htmlFor="of-credit">
                  <select id="of-credit" className={inputClass} value={oCredit} onChange={(e) => setOCredit(e.target.value as typeof oCredit)}>
                    <option value="unknown">Unknown</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Offer expiry date" htmlFor="of-xdate">
                  <input id="of-xdate" type="date" className={inputClass} value={oExpiryDate} onChange={(e) => setOExpiryDate(e.target.value)} />
                </Field>
                <Field label="Expiry time" htmlFor="of-xtime">
                  <input id="of-xtime" type="time" className={inputClass} value={oExpiryTime} onChange={(e) => setOExpiryTime(e.target.value)} />
                </Field>
              </div>
              <p className="text-sm text-muted">Both the appointment and expiry must be in the future (UAE time).</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setOfferFor(null)}>Cancel</Button>
                <Button onClick={() => sendOffer(offerFor)}>Send offer</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Question */}
      {questionFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ask a question">
          <button className="absolute inset-0 bg-charcoal/40" onClick={() => setQuestionFor(null)} aria-label="Cancel" />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-surface p-5 shadow-[0_8px_24px_rgba(0,0,0,.12)]">
            <h2 className="mb-3 text-[24px]">Ask one short question</h2>
            <input className={`${inputClass} w-full`} value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Question" />
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" onClick={() => setQuestionFor(null)}>Cancel</Button>
              <Button
                onClick={() =>
                  run(() => {
                    dispatchDemo({ type: 'askQuestion', enquiryId: questionFor, question, nowIso: new Date().toISOString() });
                    setQuestionFor(null);
                  })
                }
              >
                Send question
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Decline */}
      {declineFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Decline enquiry">
          <button className="absolute inset-0 bg-charcoal/40" onClick={() => setDeclineFor(null)} aria-label="Cancel" />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-surface p-5 shadow-[0_8px_24px_rgba(0,0,0,.12)]">
            <h2 className="mb-3 text-[24px]">Decline enquiry</h2>
            <input className={`${inputClass} w-full`} placeholder="Reason (optional)" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} aria-label="Decline reason" />
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" onClick={() => setDeclineFor(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() =>
                  run(() => {
                    dispatchDemo({ type: 'decline', enquiryId: declineFor, reason: declineReason || undefined, nowIso: new Date().toISOString() });
                    setDeclineFor(null);
                  })
                }
              >
                Decline
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
