import type {
  EnquiryStatus,
  Offer,
  PriceEntry,
  ServiceCode,
} from '@pitpal/shared';
import { formatUae } from '@pitpal/shared';

export const SERVICE_LABELS: Record<ServiceCode, string> = {
  ac: 'Air conditioning',
  brakes: 'Brakes',
  tyres: 'Tyres',
  electrical: 'Electrical',
  engine_transmission_inspection: 'Engine/transmission inspection',
  general_inspection: 'General inspection',
  routine_service: 'Routine service',
  bodywork_paint: 'Bodywork & paint',
  interior: 'Interior',
  full_restoration: 'Full restoration',
  custom_work: 'Custom work',
};

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  waiting: 'Waiting',
  info_needed: 'More information needed',
  offer_received: 'Offer received',
  declined: 'Declined',
  expired: 'Expired',
  confirmed: 'Confirmed',
  superseded: 'Another option selected',
  cancelled: 'Cancelled',
};

export const FIRST_STEP_LABELS: Record<Offer['firstStep'], string> = {
  inspection: 'Inspection first',
  defined_service: 'Defined service',
  restoration_consultation: 'Restoration consultation',
};

export const PRICE_TYPE_LABELS: Record<PriceEntry['type'], string> = {
  inspection_fee: 'Inspection fee',
  fixed_service: 'Fixed service price',
  estimate: 'Estimate',
  assessment_required: 'Assessment required',
  unspecified: 'Price not specified',
};

export const TAX_LABELS: Record<PriceEntry['tax'], string> = {
  included: 'VAT included',
  excluded: 'VAT excluded',
  unknown: 'VAT treatment unknown',
};

export const CREDIT_LABELS: Record<PriceEntry['inspectionFeeCredited'], string> = {
  yes: 'Inspection fee credited towards work',
  no: 'Inspection fee not credited',
  unknown: 'Inspection-fee credit policy unknown',
};

export function formatAed(amount: PriceEntry['amountAed']): string {
  if (!amount) return 'Not specified';
  if (amount.max != null && amount.max !== amount.min)
    return `${amount.min}–${amount.max} AED`;
  return `${amount.min} AED`;
}

export function formatDateTime(iso: string): string {
  return formatUae(iso);
}

export function elapsed(iso: string, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export const AVAILABILITY_LABELS = {
  today: 'Accepting today',
  this_week: 'Accepting this week',
  needs_confirmation: 'Availability needs confirmation',
  not_accepting: 'Not accepting',
} as const;
