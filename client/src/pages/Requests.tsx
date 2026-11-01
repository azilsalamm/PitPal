import { useNavigate } from 'react-router-dom';
import { useAppState } from '../state/AppStateContext';
import { Card, StatusPill } from '../components/ui';
import { elapsed, ENQUIRY_STATUS_LABELS } from '../lib/format';

export default function Requests() {
  const { demo } = useAppState();
  const navigate = useNavigate();
  const requests = Object.values(demo.requests).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">My requests</h1>
      {requests.length === 0 ? (
        <p className="mt-4 text-muted">No requests yet. Find a garage to get started.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {requests.map((r) => {
            const enqs = r.enquiryIds.map((id) => demo.enquiries[id]).filter(Boolean);
            return (
              <Card key={r.id}>
                <button
                  className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => navigate(`/request/${r.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">
                        {r.vehicle.make} {r.vehicle.model}
                        {r.vehicle.year !== 'unknown' ? ` ${r.vehicle.year}` : ''}
                      </p>
                      <p className="text-sm text-muted">
                        sent {elapsed(r.createdAt)} · {enqs.length} garage{enqs.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <StatusPill tone="demo">Demo</StatusPill>
                      <StatusPill tone={r.status === 'confirmed' ? 'good' : r.status === 'cancelled' ? 'bad' : 'neutral'}>
                        {r.status === 'confirmed' ? 'Confirmed' : r.status === 'cancelled' ? 'Cancelled' : 'Open'}
                      </StatusPill>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {enqs.map((e) => (
                      <StatusPill key={e.id} tone="neutral">
                        {ENQUIRY_STATUS_LABELS[e.status]}
                      </StatusPill>
                    ))}
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
