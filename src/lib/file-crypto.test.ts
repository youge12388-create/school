import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { decryptBuffer, encryptBuffer } from "./file-crypto";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("encrypted document storage", () => {
  it("可解密原文并检测篡改", () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-"));
    dirs.push(dir);
    process.env.APP_KEY_PATH = join(dir, "app.key");
    const plain = Buffer.from("passport-test-data");
    const result = encryptBuffer(plain);
    expect(
      decryptBuffer(result.encrypted, result.iv, result.tag, result.checksum),
    ).toEqual(plain);
    const tampered = Buffer.from(result.encrypted);
    tampered[0] ^= 1;
    expect(() =>
      decryptBuffer(tampered, result.iv, result.tag, result.checksum),
    ).toThrow();
  });
});
