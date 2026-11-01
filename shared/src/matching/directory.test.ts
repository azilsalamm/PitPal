import { describe, expect, it } from 'vitest';
import { directoryHints, mergeListings, normaliseName } from './directory.js';
import type { DirectoryListing, Garage } from '../models.js';

const mkGarage = (name: string): Garage => ({
  id: `geoapify:${name}`,
  listingType: 'public_listing',
  source: { provider: 'geoapify', retrievedAt: 'x' },
  name,
  emirate: 'abu_dhabi',
  area: 'Al Khalidiyah',
  coords: { lat: 24.47, lon: 54.35 },
  makeSupport: { mode: 'unknown' },
  restrictions: [],
  services: [],
  specialities: [],
  evidence: [],
  prices: [],
  participation: { status: 'none', acceptingEnquiries: false },
});

const mkDir = (name: string, emirate = 'abu_dhabi'): DirectoryListing => ({
  id: `dir:reachuae:${name}`,
  name,
  area: 'Al Khalidiyah',
  emirate: emirate as DirectoryListing['emirate'],
  address: null,
  phone: '+9712000000',
  website: null,
  directoryProfileUrl: null,
  mapsUrl: null,
  listedServices: ['AC repair'],
  source: { id: 'reachuae', name: 'Reach UAE', url: 'https://x' },
  retrievedAt: 'x',
});

describe('mergeListings', () => {
  it('merges same-name listings across punctuation/LLC variants', () => {
    expect(normaliseName('Khalidiya Motors LLC')).toBe(normaliseName('Khalidiya Motors'));
    expect(normaliseName('Al Noor Auto Garage')).toBe(normaliseName('Al Noor'));
    const { merged, remainingDirs } = mergeListings(
      [mkGarage('Khalidiya Motors L.L.C.')],
      [mkDir('Khalidiya Motors'), mkDir('Different Place')],
    );
    expect(merged[0].directory?.listedServices).toEqual(['AC repair']);
    expect(remainingDirs).toHaveLength(1);
  });

  it('does not merge across emirates', () => {
    const { merged, remainingDirs } = mergeListings(
      [mkGarage('Khalidiya Motors')],
      [mkDir('Khalidiya Motors', 'dubai')],
    );
    expect(merged[0].directory).toBeUndefined();
    expect(remainingDirs).toHaveLength(1);
  });
});

describe('directoryHints', () => {
  const services = [
    'AC repair and recharge',
    'Brake pad replacement',
    'Toyota specialists',
    'Oil change & filter',
  ];
  it('matches each service code by keyword', () => {
    expect(directoryHints(services, 'Toyota', 'ac').service).toBe('listed');
    expect(directoryHints(services, 'Toyota', 'brakes').service).toBe('listed');
    expect(directoryHints(services, 'Toyota', 'routine_service').service).toBe('listed');
    expect(directoryHints(services, 'Toyota', 'ac').matchedTerms.length).toBeGreaterThan(0);
  });
  it('detects the vehicle make in service text', () => {
    expect(directoryHints(services, 'Toyota', 'ac').make).toBe('listed');
    expect(directoryHints(services, 'BMW', 'ac').make).toBe('not_listed');
  });
  it('returns not_listed negatives', () => {
    const h = directoryHints(['Tyre shop'], 'Toyota', 'full_restoration');
    expect(h.service).toBe('not_listed');
    expect(h.matchedTerms).toEqual([]);
  });
});
