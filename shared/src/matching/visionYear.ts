import type { VehicleProfile, VisionSuggestion } from '../models.js';

export function suggestedVehicleYear({ yearFrom, yearTo, confidence }: VisionSuggestion): VehicleProfile['year'] {
  return confidence === 'high' && yearFrom !== null && yearFrom === yearTo ? yearFrom : 'unknown';
}
