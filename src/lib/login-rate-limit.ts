const MAX_FAILED_ATTEMPTS = 7;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;
const IDLE_EVICT_MS = 60 * 60 * 1000;

type AttemptRecord = {
  failures: number;
  blockedUntil: number | null;
  updatedAt: number;
};

const attempts = new Map<string, AttemptRecord>();

function pruneAttempts(now: number) {
  if (attempts.size < MAX_TRACKED_KEYS) return;
  for (const [key, record] of attempts) {
    const expiredLock = record.blockedUntil != null && record.blockedUntil <= now;
    const staleIdle = record.blockedUntil == null && now - record.updatedAt > IDLE_EVICT_MS;
    if (expiredLock || staleIdle) attempts.delete(key);
  }
  while (attempts.size >= MAX_TRACKED_KEYS) {
    const oldest = attempts.keys().next().value;
    if (oldest === undefined) break;
    attempts.delete(oldest);
  }
}

function attemptKey(username: string, ipAddress: string | null) {
  return `${username}\u0000${ipAddress ?? "unknown"}`;
}

export function getLoginAttemptLimit(username: string, ipAddress: string | null, now = Date.now()) {
  const key = attemptKey(username, ipAddress);
  const record = attempts.get(key);

  if (!record?.blockedUntil) return null;
  if (record.blockedUntil <= now) {
    attempts.delete(key);
    return null;
  }

  return Math.ceil((record.blockedUntil - now) / 1000);
}

export function recordFailedLogin(username: string, ipAddress: string | null, now = Date.now()) {
  pruneAttempts(now);
  const key = attemptKey(username, ipAddress);
  const current = attempts.get(key) ?? { failures: 0, blockedUntil: null, updatedAt: now };
  const failures = current.failures + 1;
  const blockedUntil = failures >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : null;

  attempts.delete(key);
  attempts.set(key, { failures, blockedUntil, updatedAt: now });
  return blockedUntil ? Math.ceil(LOCKOUT_MS / 1000) : null;
}

export function clearFailedLogins(username: string, ipAddress: string | null) {
  attempts.delete(attemptKey(username, ipAddress));
}

export function resetLoginRateLimitForTests() {
  attempts.clear();
}

export const loginRateLimit = {
  maxFailedAttempts: MAX_FAILED_ATTEMPTS,
  lockoutMs: LOCKOUT_MS,
};
