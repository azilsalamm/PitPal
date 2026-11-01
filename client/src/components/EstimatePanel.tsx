import { useEffect, useState } from 'react';
import { Button, StatusPill } from './ui';
import { ApiError, postJson } from '../lib/api';

export interface EstimateRequest {
  garage: {
    name: string;
    emirate: string;
    area?: string | null;
    website?: string | null;
    listedServices?: string[];
  };
  vehicle: { make: string; model?: string; year?: number | string | null };
  job: { category: string; service: string; description?: string };
}

interface EstimateItem {
  item: string;
  detail: string;
  lowAed: number;
  highAed: number;
  basis: 'garage_website' | 'uae_market_typical';
}

interface EstimateResponse {
  estimate: {
    summary: string;
    items: EstimateItem[];
    totalLowAed: number;
    totalHighAed: number;
    recommendedSpec: string[];
    questionsForGarage: string[];
    garageFitNotes: string[];
    confidence: 'high' | 'medium' | 'low';
  };
  enrichment: { sourceUrl: string; urlsAnalyzed: string[] } | null;
  generatedAt: string;
}

const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-AE')}`;

/** Builds the message to send the garage, quoting the estimate so the garage can confirm or correct it. */
export function estimateMessage(req: EstimateRequest, e: EstimateResponse['estimate'] | null, location: string): string {
  const car = [req.vehicle.make, req.vehicle.model, req.vehicle.year].filter(Boolean).join(' ');
  const lines = [
    `Hi ${req.garage.name}, I found you on PitPal.`,
    `Car: ${car}.`,
    `Job: ${req.job.service.replace(/_/g, ' ')}${req.job.description ? ` — ${req.job.description}` : ''}.`,
    `Location: ${location}.`,
  ];
  if (e) {
    lines.push(`PitPal's indicative estimate is ${aed(e.totalLowAed)}–${aed(e.totalHighAed)} (${e.items.map((i) => i.item).join(', ')}).`);
    lines.push('Could you confirm your actual price, parts/oil brand you would use and earliest availability? Thank you.');
  } else {
    lines.push('Could you send me a rough estimate and your earliest availability? Thank you.');
  }
  return lines.join('\n');
}

export function EstimatePanel({
  request,
  onEstimate,
  onClose,
}: {
  request: EstimateRequest;
  onEstimate: (e: EstimateResponse['estimate']) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ok'; data: EstimateResponse } | { status: 'error'; message: string }>({
    status: 'loading',
  });

  const requestKey = JSON.stringify(request);
  useEffect(() => {
    const request = JSON.parse(requestKey) as EstimateRequest;
    let alive = true;
    setState({ status: 'loading' });
    postJson<EstimateResponse>('/api/estimate', request)
      .then((data) => {
        if (!alive) return;
        setState({ status: 'ok', data });
        onEstimate(data.estimate);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof ApiError ? e.message : 'The estimate could not be prepared right now.';
        setState({ status: 'error', message: msg });
      });
    return () => {
      alive = false;
    };
  }, [requestKey]);

  return (
    <section className="rounded-2xl border border-borderc bg-blue/40 p-4 text-charcoal" aria-live="polite" data-testid="estimate-panel">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-muted">Indicative estimate</p>
          <h4 className="font-semibold">
            {request.job.service.replace(/_/g, ' ')} · {[request.vehicle.make, request.vehicle.model, request.vehicle.year].filter(Boolean).join(' ')}
          </h4>
        </div>
        <Button variant="ghost" className="min-h-[40px] px-3 text-sm" onClick={onClose} aria-label="Close estimate">
          Close
        </Button>
      </div>

      {state.status === 'loading' && (
        <p className="mt-3 text-sm text-muted">
          Reading {request.garage.website ? 'the garage website and ' : ''}typical UAE prices for your car… (10–40 s)
        </p>
      )}

      {state.status === 'error' && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {state.message} You can still ask the garage directly below.
        </p>
      )}

      {state.status === 'ok' && (
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p className="text-2xl font-semibold tracking-tight">
            {aed(state.data.estimate.totalLowAed)} – {aed(state.data.estimate.totalHighAed)}
          </p>
          <p>{state.data.estimate.summary}</p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-2 font-mono">Item</th>
                <th className="py-1 text-right font-mono">AED</th>
              </tr>
            </thead>
            <tbody>
              {state.data.estimate.items.map((i) => (
                <tr key={i.item} className="border-t border-borderc/60 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-medium">
                      {i.item}{' '}
                      {i.basis === 'garage_website' && <StatusPill tone="good">Garage-published</StatusPill>}
                    </div>
                    <div className="text-muted">{i.detail}</div>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    {Math.round(i.lowAed)}–{Math.round(i.highAed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.data.estimate.recommendedSpec.length > 0 && (
            <div>
              <p className="font-semibold">What your car needs</p>
              <ul className="list-disc pl-5">
                {state.data.estimate.recommendedSpec.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
          {state.data.estimate.garageFitNotes.length > 0 && (
            <div>
              <p className="font-semibold">Why this garage</p>
              <ul className="list-disc pl-5">
                {state.data.estimate.garageFitNotes.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
          {state.data.estimate.questionsForGarage.length > 0 && (
            <div>
              <p className="font-semibold">Confirm with the garage</p>
              <ul className="list-disc pl-5">
                {state.data.estimate.questionsForGarage.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted">
            Prepared by PitPal (AI) from{' '}
            {state.data.enrichment ? (
              <>
                the garage website{' '}
                <a className="underline" href={state.data.enrichment.sourceUrl} target="_blank" rel="noreferrer">
                  {new URL(state.data.enrichment.sourceUrl).hostname.replace(/^www\./, '')}
                </a>{' '}
                and{' '}
              </>
            ) : null}
            typical UAE independent-garage prices · confidence {state.data.estimate.confidence}. Not a quote — the garage
            confirms the final price and parts.
          </p>
        </div>
      )}
    </section>
  );
}
