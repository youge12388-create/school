import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("scrypt 哈希可验证正确密码并拒绝错误密码", async () => {
    const hash = await hashPassword("SecurePass!2026");
    expect(hash.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword("SecurePass!2026", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("拒绝过短密码", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });
});
