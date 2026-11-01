import { z } from 'zod';
import {
  Appointment,
  CustomerRequest,
  Offer,
  ProviderEnquiry,
  ServiceCode,
  VehicleRestriction,
  Availability,
} from '../models.js';
import { initialDemoState, type DemoState, type ProfileOverride } from './state.js';

export const DEMO_STORAGE_KEY = 'pitpal.demo.v1';

const ProfileOverrideSchema: z.ZodType<ProfileOverride> = z.object({
  services: z.array(ServiceCode).optional(),
  restrictions: z.array(VehicleRestriction).optional(),
  acceptingEnquiries: z.boolean().optional(),
  availability: Availability.optional(),
});

const DemoStateSchema: z.ZodType<DemoState> = z.object({
  version: z.literal(1),
  mode: z.enum(['live', 'demo']),
  profileOverrides: z.record(ProfileOverrideSchema),
  requests: z.record(CustomerRequest),
  enquiries: z.record(ProviderEnquiry),
  offers: z.record(Offer),
  appointments: z.record(Appointment),
});

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> | undefined;

/**
 * Load demo state from storage. Anything invalid, unversioned or shaped for a
 * different version produces a fresh state rather than throwing.
 */
export function loadDemoState(storage: StorageLike): DemoState {
  if (!storage) return initialDemoState();
  let raw: string | null = null;
  try {
    raw = storage.getItem(DEMO_STORAGE_KEY);
  } catch {
    return initialDemoState();
  }
  if (!raw) return initialDemoState();
  try {
    const parsed = DemoStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : initialDemoState();
  } catch {
    return initialDemoState();
  }
}

export function saveDemoState(storage: StorageLike, state: DemoState): void {
  if (!storage) return;
  try {
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full / unavailable — demo state just won't persist
  }
}
