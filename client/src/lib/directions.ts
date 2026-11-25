import type { Garage } from '@pitpal/shared';

export function garageDirectionsUrl({ name, address, area, emirate }: Pick<Garage, 'name' | 'address' | 'area' | 'emirate'>): string {
  const location = address?.trim() || [area, emirate.replace(/_/g, ' '), 'United Arab Emirates'].filter(Boolean).join(', ');
  const destination = location.split(',')[0].trim().toLowerCase() === name.trim().toLowerCase()
    ? location
    : `${name}, ${location}`;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}`;
}
