import { afterEach, describe, expect, it } from "vitest";

import {
  clearFailedLogins,
  getLoginAttemptLimit,
  loginRateLimit,
  recordFailedLogin,
  resetLoginRateLimitForTests,
} from "./login-rate-limit";

afterEach(() => {
  resetLoginRateLimitForTests();
});

describe("login rate limit", () => {
  it("locks an account and IP pair after seven failed attempts", () => {
    const now = 1_000_000;

    for (let attempt = 1; attempt < loginRateLimit.maxFailedAttempts; attempt += 1) {
      expect(recordFailedLogin("advisor", "203.0.113.8", now)).toBeNull();
    }

    expect(recordFailedLogin("advisor", "203.0.113.8", now)).toBe(900);
    expect(getLoginAttemptLimit("advisor", "203.0.113.8", now)).toBe(900);
    expect(getLoginAttemptLimit("advisor", "203.0.113.8", now + loginRateLimit.lockoutMs)).toBeNull();
  });

  it("keeps attempt records isolated and clears them after a successful login", () => {
    const now = 1_000_000;

    for (let attempt = 0; attempt < loginRateLimit.maxFailedAttempts; attempt += 1) {
      recordFailedLogin("advisor", "203.0.113.8", now);
    }

    expect(getLoginAttemptLimit("advisor", "203.0.113.9", now)).toBeNull();
    clearFailedLogins("advisor", "203.0.113.8");
    expect(getLoginAttemptLimit("advisor", "203.0.113.8", now)).toBeNull();
  });
});
