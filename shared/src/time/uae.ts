const UAE_TZ = 'Asia/Dubai';
// UAE has no daylight-saving time; it is always UTC+04:00.
const UAE_OFFSET = '+04:00';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: UAE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const displayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: UAE_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Calendar date in Asia/Dubai as 'YYYY-MM-DD'. */
export function uaeDateString(date: Date): string {
  return dateFormatter.format(date);
}

export function uaeNow(): Date {
  return new Date();
}

/** "Mon 21 Sep, 10:30 (UAE)" */
export function formatUae(iso: string): string {
  const d = new Date(iso);
  const parts = displayFormatter.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} (UAE)`;
}

/** Combine a UAE-local date ('YYYY-MM-DD') and time ('HH:mm') into an ISO string with +04:00. */
export function uaeLocalToIso(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00${UAE_OFFSET}`;
}

export function isFuture(iso: string, now: Date): boolean {
  return new Date(iso).getTime() > now.getTime();
}
