import { afterEach, describe, expect, it } from "vitest";

import {
  getClientIp,
  getTrustedForwardedProtocol,
  shouldUseSecureSessionCookie,
} from "./request-security";

const originalTrustProxy = process.env.TRUST_PROXY;

afterEach(() => {
  if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = originalTrustProxy;
});

function request(headers: HeadersInit = {}) {
  return new Request("http://localhost:3000/api/auth/login", { headers, method: "POST" });
}

describe("request security", () => {
  it("ignores forwarded headers unless a proxy is explicitly trusted", () => {
    process.env.TRUST_PROXY = "false";
    const value = request({
      "x-forwarded-for": "203.0.113.8",
      "x-forwarded-proto": "https",
    });

    expect(getClientIp(value)).toBeNull();
    expect(getTrustedForwardedProtocol(value)).toBeNull();
    expect(shouldUseSecureSessionCookie(value)).toBe(false);
  });

  it("uses forwarded client details when the proxy is trusted", () => {
    process.env.TRUST_PROXY = "true";
    const value = request({
      "x-forwarded-for": "203.0.113.8, 10.0.0.1",
      "x-forwarded-proto": "https",
    });

    expect(getClientIp(value)).toBe("203.0.113.8");
    expect(getTrustedForwardedProtocol(value)).toBe("https");
    expect(shouldUseSecureSessionCookie(value)).toBe(true);
  });
});
