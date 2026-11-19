import { afterEach, describe, expect, it, vi } from "vitest";

import { appUrl, isSameOrigin } from "./http";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appUrl", () => {
  it("uses the configured HTTPS origin for redirects behind a proxy", () => {
    vi.stubEnv("APP_PUBLIC_ORIGIN", "https://school.example");
    const req = new Request("http://localhost:3000/login", { headers: { host: "school.example:443" } });
    expect(String(appUrl(req, "/dashboard"))).toBe("https://school.example/dashboard");
  });
  it("preserves the browser host when Next normalizes request.url", () => {
    const request = new Request("http://localhost:3000/api/auth/login", {
      headers: { host: "127.0.0.1:3000" },
      method: "POST",
    });

    expect(String(appUrl(request, "/dashboard"))).toBe(
      "http://127.0.0.1:3000/dashboard",
    );
  });

  it("keeps query strings for redirect targets", () => {
    const request = new Request("http://localhost:3000/api/customers", {
      headers: { host: "127.0.0.1:3000" },
      method: "POST",
    });

    expect(String(appUrl(request, "/customers/new?error=错误"))).toBe(
      "http://127.0.0.1:3000/customers/new?error=%E9%94%99%E8%AF%AF",
    );
  });

  it("ignores unsafe host headers", () => {
    const request = new Request("http://localhost:3000/api/auth/login", {
      headers: { host: "127.0.0.1:3000/path" },
      method: "POST",
    });

    expect(String(appUrl(request, "/dashboard"))).toBe(
      "http://localhost:3000/dashboard",
    );
  });
});

describe("isSameOrigin", () => {
  it("accepts only the configured public origin even without proxy protocol headers", () => {
    vi.stubEnv("APP_PUBLIC_ORIGIN", "https://school.example");
    const req = (origin: string) => new Request("http://localhost:3000/login", { method: "POST", headers: { origin, host: "school.example:443" } });
    expect(isSameOrigin(req("https://school.example"))).toBe(true);
    expect(isSameOrigin(req("https://evil.example"))).toBe(false);
  });
  it("accepts the browser origin even when the internal request host differs", () => {
    const request = new Request("https://internal.example/api/customers", {
      method: "POST",
      headers: {
        host: "app.example.com",
        origin: "https://app.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it("accepts a reverse-proxy forwarded host", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const request = new Request("http://127.0.0.1:3000/api/customers", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "https://school.example.com",
        "x-forwarded-host": "school.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it("rejects a cross-origin or missing origin", () => {
    const crossOrigin = new Request("https://internal.example/api/customers", {
      method: "POST",
      headers: { host: "app.example.com", origin: "https://evil.example" },
    });
    const missingOrigin = new Request(
      "https://internal.example/api/customers",
      { method: "POST", headers: { host: "app.example.com" } },
    );

    expect(isSameOrigin(crossOrigin)).toBe(false);
    expect(isSameOrigin(missingOrigin)).toBe(false);
  });
});
