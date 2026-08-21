const MAX_FAILED_ATTEMPTS = 7;
const LOCKOUT_MS = 15 * 60 * 1000;

type AttemptRecord = {
  failures: number;
  blockedUntil: number | null;
};

const attempts = new Map<string, AttemptRecord>();

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
  const key = attemptKey(username, ipAddress);
  const current = attempts.get(key) ?? { failures: 0, blockedUntil: null };
  const failures = current.failures + 1;
  const blockedUntil = failures >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : null;

  attempts.set(key, { failures, blockedUntil });
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
