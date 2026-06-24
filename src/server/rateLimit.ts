// Lightweight in-memory rate limiter for the single-process self-hosted server.
// Used to blunt credential brute-force on the login route: after a burst of
// failures from the same key (IP + username), requests are rejected with an
// increasing cool-down. State is per-process and resets on restart — sufficient
// for a LAN/home server; a multi-worker deployment would move this to the DB.

interface Bucket {
  fails: number;
  blockedUntil: number;
}

const buckets = new Map<string, Bucket>();
const MAX_FAILS = 5; // free attempts before back-off kicks in
const BASE_COOLDOWN_MS = 5_000; // doubles per failure past the threshold, capped
const MAX_COOLDOWN_MS = 15 * 60_000; // 15 min ceiling
const SWEEP_AFTER_MS = 30 * 60_000; // forget idle buckets

function sweep(now: number) {
  for (const [key, b] of buckets) {
    if (b.blockedUntil < now && now - b.blockedUntil > SWEEP_AFTER_MS) buckets.delete(key);
  }
}

/** Returns the remaining cool-down in ms (>0 means the caller must reject). */
export function rateLimitCheck(key: string): number {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) return 0;
  return b.blockedUntil > now ? b.blockedUntil - now : 0;
}

/** Record a failed attempt and arm/extend the cool-down once over the threshold. */
export function rateLimitFail(key: string): void {
  const now = Date.now();
  if (buckets.size > 5_000) sweep(now); // bound memory under abuse
  const b = buckets.get(key) ?? { fails: 0, blockedUntil: 0 };
  b.fails += 1;
  if (b.fails > MAX_FAILS) {
    const over = b.fails - MAX_FAILS;
    const cooldown = Math.min(BASE_COOLDOWN_MS * 2 ** (over - 1), MAX_COOLDOWN_MS);
    b.blockedUntil = now + cooldown;
  }
  buckets.set(key, b);
}

/** Clear the bucket after a successful auth. */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}

/** Best-effort client IP from common proxy headers, falling back to a constant. */
export function clientKey(request: Request, suffix = ""): string {
  const xff = request.headers.get("x-forwarded-for");
  const ip = (xff ? xff.split(",")[0] : null)?.trim() || request.headers.get("x-real-ip") || "local";
  return `${ip}:${suffix}`;
}
