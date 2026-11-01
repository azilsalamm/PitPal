import type { DirectoryListing, Garage, ServiceCode } from '../models.js';

/** Normalise a garage name for cross-source matching. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/l\.?\s?l\.?\s?c\.?/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !['garage', 'auto', 'llc'].includes(t))
    .join(' ');
}

export interface MergedListing {
  garage: Garage;
  directory?: DirectoryListing;
}

/**
 * Merge directory rows into Geoapify listings where the normalised name
 * matches within the same emirate, OR where normalised names share a token
 * and coords are within ~300 m (same premises, different naming). Geoapify
 * keeps coords/address/distance; the directory contributes
 * listedServices/phone/website. Both sources are credited on the merged card.
 */
export function mergeListings(
  geo: Garage[],
  dirs: DirectoryListing[],
): { merged: MergedListing[]; remainingDirs: DirectoryListing[] } {
  const merged: MergedListing[] = geo.map((g) => ({ garage: g }));
  const remainingDirs: DirectoryListing[] = [];
  for (const d of dirs) {
    const key = normaliseName(d.name);
    const hit = key
      ? merged.find(
          (m) =>
            !m.directory &&
            m.garage.emirate === d.emirate &&
            normaliseName(m.garage.name) === key,
        )
      : undefined;
    if (hit) hit.directory = d;
    else remainingDirs.push(d);
  }
  return { merged, remainingDirs };
}

const SERVICE_TERMS: Record<ServiceCode, string[]> = {
  ac: ['a/c', 'ac ', ' ac', 'air con', 'aircon', 'air conditioning'],
  brakes: ['brake'],
  tyres: ['tyre', 'tire', 'wheel'],
  electrical: ['electric'],
  engine_transmission_inspection: ['engine', 'transmission', 'gearbox', 'diagnos'],
  general_inspection: ['inspection', 'diagnos', 'check'],
  routine_service: ['service', 'oil', 'lube', 'maintenance', 'filter'],
  bodywork_paint: ['dent', 'paint', 'body', 'accident'],
  interior: ['interior', 'upholster'],
  full_restoration: ['restor', 'classic'],
  custom_work: ['custom', 'modif', 'wrap'],
};

export interface DirectoryHints {
  service: 'listed' | 'not_listed';
  make: 'listed' | 'not_listed';
  matchedTerms: string[];
}

/**
 * Soft hints from free-text directory services. Unverified — never treated as
 * confirmed capability.
 */
export function directoryHints(
  listedServices: string[],
  vehicleMake: string,
  required: ServiceCode,
): DirectoryHints {
  const matchedTerms: string[] = [];
  let service: DirectoryHints['service'] = 'not_listed';
  for (const s of listedServices) {
    const lower = ` ${s.toLowerCase()} `;
    for (const term of SERVICE_TERMS[required]) {
      if (lower.includes(term)) {
        service = 'listed';
        if (!matchedTerms.includes(term.trim())) matchedTerms.push(term.trim());
      }
    }
  }
  const make = listedServices.some((s) =>
    s.toLowerCase().includes(vehicleMake.toLowerCase()),
  )
    ? 'listed'
    : 'not_listed';
  return { service, make, matchedTerms };
}
