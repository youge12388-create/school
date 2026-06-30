import { describe, expect, it } from "vitest";

import { appUrl } from "./http";

describe("appUrl", () => {
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
