import type { Garage } from '@pitpal/shared';

export function garageDirectionsUrl({ name, address, area, emirate }: Pick<Garage, 'name' | 'address' | 'area' | 'emirate'>): string {
  const addressText = address?.trim().replace(/[,\s]+$/, '');
  const normalisedName = name.trim().toLowerCase();
  const location = addressText && addressText.toLowerCase() !== normalisedName
    ? addressText
    : [area, emirate.replace(/_/g, ' '), 'United Arab Emirates'].filter(Boolean).join(', ');
  const destination = location.split(',')[0].trim().toLowerCase() === normalisedName
    ? location
    : `${name}, ${location}`;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}`;
}
