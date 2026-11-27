import { describe, expect, it } from 'vitest';
import type { VisionSuggestion } from '../models.js';
import { suggestedVehicleYear } from './visionYear.js';

describe('suggestedVehicleYear', () => {
  it.each([
    [2010, 2019, 'high', 'unknown'],
    [2021, null, 'high', 'unknown'],
    [null, 2019, 'high', 'unknown'],
    [null, null, 'high', 'unknown'],
    [2018, 2018, 'medium', 'unknown'],
    [2018, 2018, 'low', 'unknown'],
    [2018, 2018, 'high', 2018],
  ] as const)('maps %s–%s (%s confidence) to %s', (yearFrom, yearTo, confidence, expected) => {
    const suggestion: VisionSuggestion = { make: 'Nissan', model: 'Patrol', note: '', yearFrom, yearTo, confidence };
    expect(suggestedVehicleYear(suggestion)).toBe(expected);
  });
});
