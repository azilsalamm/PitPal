import type { DirectoryListing, Garage } from '@pitpal/shared';

const KEY = 'pitpal.dirlistings.v1';
const LIVE_KEY = 'pitpal.livelistings.v1';

export function saveDirListings(list: DirectoryListing[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getDirListing(id: string): DirectoryListing | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    return (JSON.parse(raw) as DirectoryListing[]).find((l) => l.id === id);
  } catch {
    return undefined;
  }
}

export function saveLiveListings(list: Garage[]): void {
  try {
    sessionStorage.setItem(LIVE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getLiveListing(id: string): Garage | undefined {
  try {
    const raw = sessionStorage.getItem(LIVE_KEY);
    if (!raw) return undefined;
    return (JSON.parse(raw) as Garage[]).find((l) => l.id === id);
  } catch {
    return undefined;
  }
}
