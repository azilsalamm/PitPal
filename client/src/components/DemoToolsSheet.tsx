import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { demoScenarios } from '@pitpal/shared';
import { useAppState } from '../state/AppStateContext';
import { Button, Sheet } from './ui';

export default function DemoToolsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { demo, dispatchDemo, updateJourney, garages } = useAppState();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const [simEnquiry, setSimEnquiry] = useState('');
  const [simKind, setSimKind] = useState<'offer' | 'question' | 'decline' | 'expired_offer'>('offer');

  const enquiries = Object.values(demo.enquiries).filter((e) =>
    ['waiting', 'info_needed'].includes(e.status),
  );

  const loadScenario = (key: 'corollaAcAbuDhabi' | 'classicCorollaRestoration') => {
    const s = demoScenarios[key];
    updateJourney({ vehicle: s.vehicle, job: s.job, prefs: s.prefs, step: 'done' });
    dispatchDemo({ type: 'enterDemo' });
    onClose();
    navigate('/results');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Demo tools">
      <p className="text-sm text-muted">Demo data lives only in this browser.</p>
      <div className="mt-4 flex flex-col gap-2">
        {demo.mode === 'demo' ? (
          <Button variant="secondary" onClick={() => { dispatchDemo({ type: 'leaveDemo' }); }}>
            Leave demo mode
          </Button>
        ) : (
          <Button onClick={() => dispatchDemo({ type: 'enterDemo' })}>Enter demo mode</Button>
        )}
        <Button variant="secondary" onClick={() => { onClose(); navigate('/'); }}>
          Customer view
        </Button>
        <Button variant="secondary" onClick={() => { onClose(); navigate('/garage-view'); }}>
          Garage view
        </Button>
        <Button variant="secondary" onClick={() => loadScenario('corollaAcAbuDhabi')}>
          Load “Corolla AC in Abu Dhabi”
        </Button>
        <Button variant="secondary" onClick={() => loadScenario('classicCorollaRestoration')}>
          Load “Classic Corolla restoration across the UAE”
        </Button>
      </div>

      <div className="mt-6 border-t border-borderc pt-4">
        <h3 className="font-medium">Simulate a reply… <span className="text-accent">(Simulation)</span></h3>
        <select
          aria-label="Enquiry"
          className="mt-2 min-h-[48px] w-full rounded-xl border border-borderc px-3"
          value={simEnquiry}
          onChange={(e) => setSimEnquiry(e.target.value)}
        >
          <option value="">Choose enquiry…</option>
          {enquiries.map((e) => {
            const g = garages.find((x) => x.id === e.garageId);
            return (
              <option key={e.id} value={e.id}>
                {g?.name ?? e.garageId} — {e.status}
              </option>
            );
          })}
        </select>
        <select
          aria-label="Reply kind"
          className="mt-2 min-h-[48px] w-full rounded-xl border border-borderc px-3"
          value={simKind}
          onChange={(e) => setSimKind(e.target.value as typeof simKind)}
        >
          <option value="offer">Send an offer</option>
          <option value="question">Ask a question</option>
          <option value="decline">Decline</option>
          <option value="expired_offer">Offer that’s already expired</option>
        </select>
        <Button
          className="mt-3"
          variant="secondary"
          disabled={!simEnquiry}
          onClick={() => {
            const enq = demo.enquiries[simEnquiry];
            const garage = garages.find((g) => g.id === enq?.garageId);
            if (!enq || !garage) return;
            dispatchDemo({
              type: 'simulateReply',
              enquiryId: simEnquiry,
              kind: simKind,
              nowIso: new Date().toISOString(),
              garage,
              ids: { offerId: crypto.randomUUID() },
            });
            dispatchDemo({ type: 'tick', nowIso: new Date().toISOString() });
          }}
        >
          Simulate
        </Button>
      </div>

      <div className="mt-6 border-t border-borderc pt-4">
        {confirmReset ? (
          <div>
            <p className="text-sm">Reset this browser’s demo? This clears demo requests and replies only.</p>
            <div className="mt-2 flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>Keep</Button>
              <Button variant="danger" onClick={() => { dispatchDemo({ type: 'reset' }); setConfirmReset(false); }}>
                Reset demo
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Reset this browser’s demo
          </Button>
        )}
      </div>
    </Sheet>
  );
}
