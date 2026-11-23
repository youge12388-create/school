import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  getClientIp,
  getMaxUploadBytes,
  getTrustedForwardedProtocol,
  isPathWithinRoot,
  shouldUseSecureSessionCookie,
} from "./request-security";

const originalTrustProxy = process.env.TRUST_PROXY;
const originalMaxUpload = process.env.MAX_UPLOAD_MB;

afterEach(() => {
  if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = originalTrustProxy;
  if (originalMaxUpload === undefined) delete process.env.MAX_UPLOAD_MB;
  else process.env.MAX_UPLOAD_MB = originalMaxUpload;
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

  it("blocks sibling prefix path traversal in isPathWithinRoot", () => {
    const root = resolve("./data/uploads");
    expect(isPathWithinRoot(root, resolve(root, "cust-1", "doc.enc"))).toBe(true);
    expect(isPathWithinRoot(root, root)).toBe(false);
    expect(isPathWithinRoot(root, resolve(root, "../uploads-evil/doc.enc"))).toBe(false);
    expect(isPathWithinRoot(root, resolve(root, "../secret.txt"))).toBe(false);
  });

  it("falls back safely when MAX_UPLOAD_MB is invalid or non-positive", () => {
    process.env.MAX_UPLOAD_MB = "not-a-number";
    expect(getMaxUploadBytes(20)).toBe(20 * 1024 * 1024);
    process.env.MAX_UPLOAD_MB = "-5";
    expect(getMaxUploadBytes(20)).toBe(20 * 1024 * 1024);
    process.env.MAX_UPLOAD_MB = "12";
    expect(getMaxUploadBytes(20)).toBe(12 * 1024 * 1024);
  });
});
