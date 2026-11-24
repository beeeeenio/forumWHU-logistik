// Einfache Begrenzung von Anfragen je Schlüssel (z. B. Adresse oder Person), im Speicher des Prozesses. Reicht für einen einzelnen Server-Container;
// bei mehreren Instanzen würde jede für sich zählen. Schutz vor Dauerfeuer auf Anmeldung, Export und Suche, kein Ersatz für die Berechtigungsprüfung.

type Bucket = { n: number; reset: number };
const buckets = new Map<string, Bucket>();
let lastPrune = 0;

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  if (now - lastPrune > 60_000) {
    lastPrune = now;
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
    if (buckets.size > 50_000) buckets.clear(); // Notbremse gegen unbegrenztes Wachstum
  }
  const b = buckets.get(key);
  if (!b || b.reset <= now) { buckets.set(key, { n: 1, reset: now + windowMs }); return { ok: true }; }
  if (b.n >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  b.n++;
  return { ok: true };
}

export function resetRateLimits(): void { buckets.clear(); }
