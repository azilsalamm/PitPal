import { useEffect, useState } from 'react';
import type { IntegrationStatus } from '@pitpal/shared';
import { getJson } from '../lib/api';
import { Card, StatusPill } from '../components/ui';

export default function DevIntegrations() {
  const [rows, setRows] = useState<IntegrationStatus[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getJson<{ integrations: IntegrationStatus[] }>('/api/status/integrations')
      .then((r) => setRows(r.integrations))
      .catch(() => setErr('Could not load integration status.'));
  }, []);
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1>Integrations</h1>
      <p className="mt-1 text-sm text-muted">No secrets are shown — only whether each key is present.</p>
      {err && <p className="mt-4 text-red-800">{err}</p>}
      {rows && (
        <Card className="mt-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borderc text-muted">
                <th className="py-2 font-medium">Integration</th>
                <th className="py-2 font-medium">State</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-borderc last:border-0">
                  <td className="py-2 font-mono text-[13px]">{r.name}</td>
                  <td className="py-2">
                    <StatusPill tone={r.state === 'configured' ? 'good' : 'warn'}>{r.state}</StatusPill>
                  </td>
                  <td className="py-2 text-muted">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Card className="mt-4">
        <p className="text-sm text-muted">
          Vehicle catalog: vPIC + UAE list (static extras; optional harvested catalog
          via <span className="font-mono text-[13px]">npm run vehicles:refresh -w @pitpal/server</span>).
          Cached 7 days; falls back to the static UAE list if vPIC is unreachable.
        </p>
      </Card>
    </main>
  );
}
