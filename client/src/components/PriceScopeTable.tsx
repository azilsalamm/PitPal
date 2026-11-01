import type { PriceEntry } from '@pitpal/shared';
import { CREDIT_LABELS, formatAed, PRICE_TYPE_LABELS, SERVICE_LABELS, TAX_LABELS } from '../lib/format';

export function PriceScopeTable({ prices }: { prices: PriceEntry[] }) {
  if (prices.length === 0) {
    return <p className="text-muted">No published prices.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-borderc text-muted">
            <th className="py-2 pr-3 font-medium">Service</th>
            <th className="py-2 pr-3 font-medium">Scope</th>
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 font-medium">Amount</th>
            <th className="py-2 pr-3 font-medium">Tax</th>
            <th className="py-2 font-medium">Inspection credit</th>
          </tr>
        </thead>
        <tbody>
          {prices.map((p) => (
            <tr key={p.id} className="border-b border-borderc align-top last:border-0">
              <td className="py-2 pr-3">{SERVICE_LABELS[p.service]}</td>
              <td className="py-2 pr-3">
                <div>{p.scope}</div>
                {p.inclusions.length > 0 && (
                  <div className="text-muted">Includes: {p.inclusions.join(', ')}</div>
                )}
                {p.exclusions.length > 0 && (
                  <div className="text-muted">Excludes: {p.exclusions.join(', ')}</div>
                )}
                {p.isSample && <div className="text-accent">Sample data</div>}
              </td>
              <td className="py-2 pr-3">{PRICE_TYPE_LABELS[p.type]}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{formatAed(p.amountAed)}</td>
              <td className="py-2 pr-3">{TAX_LABELS[p.tax]}</td>
              <td className="py-2">{CREDIT_LABELS[p.inspectionFeeCredited]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
