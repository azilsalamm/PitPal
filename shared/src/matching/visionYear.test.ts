import { describe, expect, it } from 'vitest';
import type { VisionSuggestion } from '../models.js';
import { suggestedVehicleYear, yearAfterVehicleEdit } from './visionYear.js';

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

describe('yearAfterVehicleEdit', () => {
  const patrol = { make: 'Nissan', model: 'Patrol', year: 2018 };

  it.each([{ make: 'Toyota' }, { model: 'Armada' }])('clears a photo year after %o, but keeps a manual year', (patch) => {
    expect(yearAfterVehicleEdit(patrol, patch, true)).toEqual({ year: 'unknown', yearFromPhoto: false });
    expect(yearAfterVehicleEdit(patrol, patch)).toEqual({ year: 2018, yearFromPhoto: false });
  });

  it('keeps a photo year for the same identity, until the owner edits the year', () => {
    expect(yearAfterVehicleEdit(patrol, { model: 'Patrol' }, true)).toEqual({ year: 2018, yearFromPhoto: true });
    expect(yearAfterVehicleEdit(patrol, { year: 2017 }, true)).toEqual({ year: 2017, yearFromPhoto: false });
  });
});
