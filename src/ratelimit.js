// Fixed-window request limiter, keyed by caller (IP). In-memory and per process, which is enough to blunt abuse of the
// model-backed endpoints; a shared limiter (Redis, Cloud Armor) is the next step if the app runs on many instances.
export function rateLimiter({ limit = 120, windowMs = 60_000, now = Date.now } = {}) {
  const hits = new Map();
  const sweep = setInterval(() => { const t = now(); for (const [k, h] of hits) if (t - h.start >= windowMs) hits.delete(k); }, windowMs);
  sweep.unref?.();
  /** Returns { ok, retryAfter } and counts this call. */
  return (key) => {
    const t = now(); let h = hits.get(key);
    if (!h || t - h.start >= windowMs) { h = { start: t, n: 0 }; hits.set(key, h); }
    h.n++;
    return h.n > limit ? { ok: false, retryAfter: Math.ceil((h.start + windowMs - t) / 1000) } : { ok: true, retryAfter: 0 };
  };
}
