import type { VehicleProfile, VisionSuggestion } from '../models.js';

export function suggestedVehicleYear({ yearFrom, yearTo, confidence }: VisionSuggestion): VehicleProfile['year'] {
  return confidence === 'high' && yearFrom !== null && yearFrom === yearTo ? yearFrom : 'unknown';
}

type VehicleIdentity = Pick<VehicleProfile, 'make' | 'model' | 'year'>;

export function yearAfterVehicleEdit(
  vehicle: VehicleIdentity | undefined,
  patch: Partial<VehicleIdentity>,
  yearFromPhoto = false,
): { year: VehicleProfile['year']; yearFromPhoto: boolean } {
  if (patch.year !== undefined) return { year: patch.year, yearFromPhoto: false };
  if (yearFromPhoto &&
    ((patch.make !== undefined && patch.make !== vehicle?.make) ||
     (patch.model !== undefined && patch.model !== vehicle?.model))) {
    return { year: 'unknown', yearFromPhoto: false };
  }
  return { year: vehicle?.year ?? 'unknown', yearFromPhoto };
}
