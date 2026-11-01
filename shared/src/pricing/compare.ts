import type { Offer } from '../models.js';

export interface OfferComparison {
  comparable: boolean;
  reason?: string;
}

const NOT_COMPARABLE =
  'These offers cover different work/tax treatment, so the amounts aren’t directly comparable.';

export function compareOffers(offers: Offer[]): OfferComparison {
  if (offers.length < 2) return { comparable: true };
  const first = offers[0];
  const same = offers.every(
    (o) =>
      o.firstStep === first.firstStep &&
      o.price.type === first.price.type &&
      o.price.tax === first.price.tax &&
      o.price.service === first.price.service,
  );
  return same ? { comparable: true } : { comparable: false, reason: NOT_COMPARABLE };
}
