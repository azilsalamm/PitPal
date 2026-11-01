import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppState } from '../state/AppStateContext';
import { Button, Card, Field, inputClass } from '../components/ui';

export default function NewRequest() {
  const { journey, demo, dispatchDemo, garages } = useAppState();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = (params.get('garages') ?? '').split(',').filter(Boolean);
  const selected = garages.filter((g) => ids.includes(g.id));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const requestIds = [...(params.get('exclude') ?? '').split(',').filter(Boolean)];

  if (!journey.vehicle || !journey.job || !journey.prefs) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-muted">The request details are missing — start again.</p>
        <Button className="mt-4" onClick={() => navigate('/')}>Back to start</Button>
      </main>
    );
  }

  const submit = () => {
    if (!name.trim() || !phone.trim()) {
      setError('Add a name and phone number (sample details are fine).');
      return;
    }
    const requestId = crypto.randomUUID();
    const enquiryIds = selected.map(() => crypto.randomUUID());
    dispatchDemo({
      type: 'createRequest',
      vehicle: journey.vehicle!,
      job: journey.job!,
      prefs: journey.prefs!,
      contact: { name: name.trim(), phone: phone.trim(), isSample: phone.includes('000') },
      garageIds: selected.map((g) => g.id),
      nowIso: new Date().toISOString(),
      ids: { requestId, enquiryIds },
    });
    navigate(`/request/${requestId}?sent=1`);
  };

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Send a request</h1>

      <Card className="mt-4">
        <h2 className="mb-2 font-semibold">Sending to</h2>
        <ul className="list-disc pl-5">
          {selected.map((g) => (
            <li key={g.id}>
              {g.name} <span className="text-muted">({g.area})</span>
            </li>
          ))}
        </ul>
        {demo.mode !== 'demo' && (
          <p className="mt-2 text-sm text-accent">Demo mode is off — enable it to send demo requests.</p>
        )}
      </Card>

      <Card className="mt-4 space-y-4">
        <h2 className="font-semibold">Your contact details</h2>
        <p className="text-sm text-accent">
          Demo only — please don’t enter real personal data. Use the sample details.
        </p>
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            setName('Sample Owner');
            setPhone('050 000 0000');
          }}
        >
          Use sample details
        </Button>
        <Field label="Name" htmlFor="cname">
          <input id="cname" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor="cphone">
          <input id="cphone" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
        <Button className="w-full" disabled={demo.mode !== 'demo' || selected.length === 0} onClick={submit}>
          Send request
        </Button>
      </Card>
      {requestIds.length > 0 && (
        <p className="mt-4 text-sm text-muted">Garages already contacted for this request are excluded.</p>
      )}
    </main>
  );
}
