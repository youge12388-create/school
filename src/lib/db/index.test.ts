import { randomUUID } from "node:crypto";
import { access, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const previousDatabasePath = process.env.DATABASE_PATH;
const tempDirs: string[] = [];

afterEach(async () => {
  if (previousDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = previousDatabasePath;
  }

  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("db module", () => {
  it("does not open SQLite when imported", async () => {
    const tempDir = join(process.cwd(), "data", `import-lazy-${randomUUID()}`);
    const databaseFile = join(tempDir, "app.db");
    tempDirs.push(tempDir);
    process.env.DATABASE_PATH = databaseFile;

    vi.resetModules();
    await import("./index");

    await expect(access(databaseFile)).rejects.toThrow();
  });
});
