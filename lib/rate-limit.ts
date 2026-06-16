import "server-only";

/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Good enough to blunt password brute-forcing in a single-instance / low-scale
 * deployment. NOTE: on serverless (multiple instances, cold starts) this is
 * best-effort only — swap for Upstash Redis / @vercel/kv if you need it to be
 * authoritative across instances.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

export function checkLoginRateLimit(identifier: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const key = `login:${identifier}`;
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
