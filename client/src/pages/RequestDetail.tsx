import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  compareOffers,
  DemoError,
  formatUae,
  type Offer,
  type ProviderEnquiry,
} from '@pitpal/shared';
import { useAppState } from '../state/AppStateContext';
import { Button, Card, inputClass, Modal, MonoTag, StatusPill } from '../components/ui';
import {
  CREDIT_LABELS,
  elapsed,
  ENQUIRY_STATUS_LABELS,
  FIRST_STEP_LABELS,
  formatAed,
  PRICE_TYPE_LABELS,
  SERVICE_LABELS,
  TAX_LABELS,
} from '../lib/format';

function ref6(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (const b of buf) s += chars[b % chars.length];
  return `PP-${s}`;
}

function offerRows(offer: Offer) {
  return [
    ['First step', FIRST_STEP_LABELS[offer.firstStep]],
    ['Date / time', formatUae(offer.appointmentAt)],
    ['Price type', PRICE_TYPE_LABELS[offer.price.type]],
    ['Amount', formatAed(offer.price.amountAed)],
    ['Includes', offer.price.inclusions.join(', ') || '—'],
    ['Excludes', offer.price.exclusions.join(', ') || '—'],
    ['Tax', TAX_LABELS[offer.price.tax]],
    ['Inspection credit', CREDIT_LABELS[offer.price.inspectionFeeCredited]],
    ['Expires', formatUae(offer.expiresAt)],
  ] as const;
}

export default function RequestDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { demo, dispatchDemo, garages } = useAppState();
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [confirmOfferId, setConfirmOfferId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const request = id ? demo.requests[id] : undefined;
  const enquiries = useMemo(
    () => (request ? request.enquiryIds.map((e) => demo.enquiries[e]).filter(Boolean) : []),
    [request, demo.enquiries],
  );

  if (!request) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-muted">Request not found in this browser’s demo data.</p>
        <Button className="mt-4" onClick={() => navigate('/requests')}>My requests</Button>
      </main>
    );
  }

  const openOffers = enquiries
    .filter((e) => e.offerId && demo.offers[e.offerId])
    .map((e) => demo.offers[e.offerId!]);
  const comparison = compareOffers(openOffers.filter((o) => o.status === 'open'));
  const appointment = request.appointmentId ? demo.appointments[request.appointmentId] : undefined;
  const alreadyContacted = enquiries.map((e) => e.garageId);

  const doConfirm = (offer: Offer) => {
    setConfirming(true);
    setErr(null);
    try {
      const garage = garages.find((g) => g.id === offer.garageId);
      if (!garage) throw new DemoError('NOT_FOUND', 'Garage not found');
      dispatchDemo({
        type: 'confirmOffer',
        offerId: offer.id,
        appointmentId: crypto.randomUUID(),
        reference: ref6(),
        nowIso: new Date().toISOString(),
        garage,
      });
      setConfirmOfferId(null);
    } catch (e) {
      setErr(e instanceof DemoError ? `${e.message} (${e.code})` : 'Could not confirm this offer.');
    } finally {
      setConfirming(false);
    }
  };

  const confirmTarget = confirmOfferId ? demo.offers[confirmOfferId] : undefined;
  const confirmGarage = confirmTarget ? garages.find((g) => g.id === confirmTarget.garageId) : undefined;

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      {params.get('sent') && (
        <p className="mb-3 rounded-2xl bg-bluechip p-3 text-strong" role="status">
          Request sent. Waiting for garage responses.
        </p>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1>
            {request.vehicle.make} {request.vehicle.model}
            {request.vehicle.year !== 'unknown' ? ` ${request.vehicle.year}` : ''}
          </h1>
          <p className="text-muted">
            {SERVICE_LABELS[request.job.service ?? 'general_inspection']} · sent {elapsed(request.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <StatusPill tone="demo">Demo</StatusPill>
          <StatusPill tone={request.status === 'confirmed' ? 'good' : request.status === 'cancelled' ? 'bad' : 'neutral'}>
            {request.status === 'confirmed' ? 'Confirmed' : request.status === 'cancelled' ? 'Cancelled' : 'Open'}
          </StatusPill>
        </div>
      </div>

      {appointment && (
        <Card elevated className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[24px]">Confirmed appointment</h2>
            <MonoTag>{appointment.reference}</MonoTag>
          </div>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Garage</dt><dd>{appointment.snapshot.garage.name} — {appointment.snapshot.garage.area}, {appointment.snapshot.garage.emirate.replace('_', ' ')}{appointment.snapshot.garage.address ? `, ${appointment.snapshot.garage.address}` : ''}</dd></div>
            <div><dt className="text-muted">Time (UAE)</dt><dd>{formatUae(appointment.snapshot.appointmentAt)}</dd></div>
            <div><dt className="text-muted">First step</dt><dd>{FIRST_STEP_LABELS[appointment.snapshot.firstStep]}</dd></div>
            <div><dt className="text-muted">Price</dt><dd>{PRICE_TYPE_LABELS[appointment.snapshot.price.type]} — {formatAed(appointment.snapshot.price.amountAed)}</dd></div>
          </dl>
          {appointment.status === 'confirmed' && (
            <Button
              variant="danger"
              className="mt-4"
              onClick={() => dispatchDemo({ type: 'cancelAppointment', appointmentId: appointment.id, nowIso: new Date().toISOString() })}
            >
              Cancel appointment
            </Button>
          )}
          {appointment.status === 'cancelled' && (
            <p className="mt-3 text-sm text-red-800">Cancelled {appointment.cancelledAt ? formatUae(appointment.cancelledAt) : ''}</p>
          )}
        </Card>
      )}

      {/* Offer comparison */}
      {openOffers.length > 1 && (
        <section className="mt-6" aria-label="Offer comparison">
          <h2 className="text-[24px]">Compare offers</h2>
          {!comparison.comparable && (
            <p className="mt-2 rounded-2xl bg-peach p-3 text-sm text-strong">
              {comparison.reason} A lower inspection fee is not necessarily a lower repair cost.
            </p>
          )}
          <div className="mt-3 hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-borderc text-muted">
                  <th className="py-2 pr-3 font-medium"></th>
                  {openOffers.map((o) => (
                    <th key={o.id} className="py-2 pr-3 font-medium">
                      {garages.find((g) => g.id === o.garageId)?.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {offerRows(openOffers[0]).map(([label], i) => (
                  <tr key={label} className="border-b border-borderc last:border-0">
                    <td className="py-2 pr-3 font-medium text-muted">{label}</td>
                    {openOffers.map((o) => (
                      <td key={o.id} className="py-2 pr-3 align-top">
                        {offerRows(o)[i][1]}
                        {o.status !== 'open' && <StatusPill tone="warn">{o.status}</StatusPill>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-3 md:hidden">
            {openOffers.map((o) => (
              <Card key={o.id}>
                <h3 className="font-semibold">{garages.find((g) => g.id === o.garageId)?.name}</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  {offerRows(o).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-muted">{k}</dt>
                      <dd className="text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Enquiries */}
      <section className="mt-6 space-y-3" aria-label="Enquiries">
        <h2 className="text-[24px]">Garage responses</h2>
        {enquiries.map((e: ProviderEnquiry) => {
          const g = garages.find((x) => x.id === e.garageId);
          const offer = e.offerId ? demo.offers[e.offerId] : undefined;
          return (
            <Card key={e.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{g?.name ?? e.garageId}</h3>
                  <p className="text-sm text-muted">sent {elapsed(e.createdAt)}</p>
                </div>
                <StatusPill
                  tone={
                    e.status === 'confirmed' ? 'good'
                    : e.status === 'offer_received' ? 'demo'
                    : e.status === 'declined' || e.status === 'expired' || e.status === 'cancelled' ? 'bad'
                    : 'neutral'
                  }
                >
                  {ENQUIRY_STATUS_LABELS[e.status]}
                </StatusPill>
              </div>

              {e.status === 'info_needed' && e.question && !e.answer && (
                <div className="mt-3 rounded-xl bg-peach p-3">
                  <p className="text-sm font-medium">Garage asks: {e.question}</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      aria-label="Your answer"
                      className={`${inputClass} flex-1`}
                      value={answer[e.id] ?? ''}
                      onChange={(ev) => setAnswer((a) => ({ ...a, [e.id]: ev.target.value }))}
                    />
                    <Button
                      variant="secondary"
                      onClick={() =>
                        dispatchDemo({ type: 'answerQuestion', enquiryId: e.id, answer: answer[e.id] ?? '', nowIso: new Date().toISOString() })
                      }
                    >
                      Send
                    </Button>
                  </div>
                </div>
              )}
              {e.answer && <p className="mt-2 text-sm text-muted">You answered: {e.answer}</p>}
              {e.declineReason && <p className="mt-2 text-sm text-muted">Reason: {e.declineReason}</p>}

              {offer && (
                <div className="mt-3 rounded-xl border border-borderc p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{FIRST_STEP_LABELS[offer.firstStep]} — {formatUae(offer.appointmentAt)}</span>
                    <span>{formatAed(offer.price.amountAed)}</span>
                  </div>
                  {offer.status === 'expired' && <StatusPill tone="warn">Expired</StatusPill>}
                  {offer.status === 'superseded' && <StatusPill tone="neutral">Another option selected</StatusPill>}
                  {offer.status === 'open' && request.status === 'open' && (
                    <Button className="mt-3" onClick={() => setConfirmOfferId(offer.id)}>
                      Confirm this offer
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </section>

      {request.status === 'open' && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate('/results')}
          >
            Try another option
          </Button>
          <Button
            variant="danger"
            onClick={() => dispatchDemo({ type: 'cancelRequest', requestId: request.id, nowIso: new Date().toISOString() })}
          >
            Cancel request
          </Button>
          <p className="w-full text-sm text-muted">
            Garages already contacted ({alreadyContacted.length}) keep their own status — starting a new option won’t lose this request.
          </p>
        </div>
      )}

      {/* Confirm modal */}
      <Modal open={!!confirmTarget} onClose={() => setConfirmOfferId(null)} title="You are agreeing to…">
        {confirmTarget && confirmGarage && (
          <div className="space-y-2 text-sm">
            <p><strong>{confirmGarage.name}</strong> — {confirmGarage.area}, {confirmGarage.emirate.replace('_', ' ')}</p>
            <p>{FIRST_STEP_LABELS[confirmTarget.firstStep]} at {formatUae(confirmTarget.appointmentAt)} (UAE)</p>
            <p>{PRICE_TYPE_LABELS[confirmTarget.price.type]}: {formatAed(confirmTarget.price.amountAed)}</p>
            <p className="text-muted">Includes: {confirmTarget.price.inclusions.join(', ') || '—'}</p>
            <p className="text-muted">Excludes: {confirmTarget.price.exclusions.join(', ') || '—'}</p>
            <p className="text-muted">{TAX_LABELS[confirmTarget.price.tax]} · {CREDIT_LABELS[confirmTarget.price.inspectionFeeCredited]}</p>
            <p className="text-muted">Other open enquiries will be marked “Another option selected”.</p>
            {err && <p className="text-red-800" role="alert">{err}</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmOfferId(null)}>Back</Button>
              <Button disabled={confirming} onClick={() => doConfirm(confirmTarget)}>
                {confirming ? 'Confirming…' : 'Confirm appointment'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
