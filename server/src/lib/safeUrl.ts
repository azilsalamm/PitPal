import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0 ||
      a >= 224
    );
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80') ||
      lower.startsWith('::ffff:') && isPrivateIp(lower.slice(7))
    );
  }
  return false;
}

/**
 * http/https only, no IP literals, no localhost/.local, and hostname must not
 * resolve to private/loopback ranges.
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed');
  }
  const host = url.hostname;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local hostnames are not allowed');
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private addresses are not allowed');
    return url;
  }
  let addrs: string[];
  try {
    addrs = (await dns.lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new Error('Could not resolve hostname');
  }
  if (addrs.some(isPrivateIp)) {
    throw new Error('Hostname resolves to a private address');
  }
  return url;
}
