interface Entry<T> {
  value: T;
  expiresAt: number;
}

/** Tiny in-memory TTL cache. */
export class TtlCache<T> {
  private map = new Map<string, Entry<T>>();
  constructor(private ttlMs: number, private maxEntries = 500) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T): void {
    if (this.map.size >= this.maxEntries) {
      const now = Date.now();
      for (const [k, e] of this.map) {
        if (e.expiresAt <= now) this.map.delete(k);
        if (this.map.size < this.maxEntries) break;
      }
      if (this.map.size >= this.maxEntries) {
        const oldest = this.map.keys().next().value;
        if (oldest !== undefined) this.map.delete(oldest);
      }
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.map.clear();
  }
}
