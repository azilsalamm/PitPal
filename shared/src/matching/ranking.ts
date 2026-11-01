import type { Garage } from '../models.js';
import type { Criteria, Evaluation } from './eligibility.js';

export interface RankedEvaluations {
  suitable: Evaluation[];
  unconfirmed: Evaluation[];
  excluded: Evaluation[];
}

const AVAIL_ORDER: Record<Evaluation['availability'], number> = {
  today: 0,
  this_week: 1,
  needs_confirmation: 2,
  not_accepting: 3,
};

function distanceKey(e: Evaluation): number {
  return e.distanceKm ?? Number.POSITIVE_INFINITY;
}

function baseSort(a: Evaluation, b: Evaluation, criteria: Criteria): number {
  const cat = criteria.job.category;
  if (cat === 'restoration') {
    const order = { relevant: 0, generic: 1, none: 2 } as const;
    const d =
      order[a.checks.restorationEvidence] - order[b.checks.restorationEvidence];
    if (d !== 0) return d;
    return distanceKey(a) - distanceKey(b);
  }
  if (cat === 'service') {
    // availability/timing fit, then comparable relevant price, then distance
    const d = AVAIL_ORDER[a.availability] - AVAIL_ORDER[b.availability];
    if (d !== 0) return d;
    const pa = a.relevantPrice?.amountAed ? 0 : 1;
    const pb = b.relevantPrice?.amountAed ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return distanceKey(a) - distanceKey(b);
  }
  // repair / unsure — today's repairs: fresh capacity then proximity
  const d = AVAIL_ORDER[a.availability] - AVAIL_ORDER[b.availability];
  if (d !== 0) return d;
  return distanceKey(a) - distanceKey(b);
}

function applyPriority(
  list: Evaluation[],
  criteria: Criteria,
  garagesById: Record<string, Garage>,
): Evaluation[] {
  const priority = criteria.prefs.priority;
  if (!priority) return list;
  const decorated = list.map((e, i) => ({ e, i }));
  if (priority === 'earliest') {
    decorated.sort(
      (x, y) =>
        AVAIL_ORDER[x.e.availability] - AVAIL_ORDER[y.e.availability] ||
        x.i - y.i,
    );
  } else if (priority === 'lower_first_visit_cost') {
    // Comparable = same price type AND same tax treatment; those with a min
    // amount sort ascending ahead of everything else.
    const priceKey = (e: Evaluation) => {
      const p = e.relevantPrice;
      if (!p || p.amountAed == null) return null;
      return { type: p.type, tax: p.tax, min: p.amountAed.min };
    };
    decorated.sort((x, y) => {
      const a = priceKey(x.e);
      const b = priceKey(y.e);
      if (a && b && a.type === b.type && a.tax === b.tax) {
        return a.min - b.min || x.i - y.i;
      }
      if (a && !b) return -1;
      if (!a && b) return 1;
      return x.i - y.i;
    });
  } else {
    // relevant_experience: count of evidence entries mentioning the vehicle make
    const make = criteria.vehicle.make.toLowerCase();
    const evCount = (e: Evaluation) =>
      (garagesById[e.garageId]?.evidence ?? []).filter((ev) =>
        ev.makes?.some((m) => m.toLowerCase() === make),
      ).length;
    decorated.sort((x, y) => evCount(y.e) - evCount(x.e) || x.i - y.i);
  }
  return decorated.map((d) => d.e);
}

export function rankEvaluations(
  evals: Evaluation[],
  criteria: Criteria,
  garagesById: Record<string, Garage>,
): RankedEvaluations {
  const suitable = evals.filter((e) => e.verdict === 'suitable');
  const unconfirmed = evals.filter((e) => e.verdict === 'unconfirmed');
  const excluded = evals.filter((e) => e.verdict === 'excluded');

  const decorated = suitable.map((e, i) => ({ e, i }));
  decorated.sort(
    (x, y) => baseSort(x.e, y.e, criteria) || x.i - y.i,
  );
  const sortedSuitable = applyPriority(
    decorated.map((d) => d.e),
    criteria,
    garagesById,
  );

  return { suitable: sortedSuitable, unconfirmed, excluded };
}
