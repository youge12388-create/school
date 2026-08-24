import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { migrateDatabase } from "@/lib/db/migration";

const previousDatabasePath = process.env.DATABASE_PATH;

let testDir: string;
let databaseFile: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "school-syt-queries-"));
  databaseFile = join(testDir, "test.db");
  process.env.DATABASE_PATH = databaseFile;
  migrateDatabase(databaseFile);
  vi.resetModules();
});

afterEach(async () => {
  const [{ sqlite }] = await Promise.all([import("@/lib/db")]);
  try {
    sqlite.close();
  } catch {
    // 连接可能已关闭，忽略
  }
  if (previousDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = previousDatabasePath;
  }
  rmSync(testDir, { recursive: true, force: true });
});

function insertSchool(
  databaseFile: string,
  id: string,
  notes: {
    infoNote?: string | null;
    cooperationNote?: string | null;
    specialCaseNote?: string | null;
  },
) {
  const database = new DatabaseSync(databaseFile);
  database
    .prepare(`
      INSERT INTO schools (id, name_zh, name, info_note, cooperation_note, special_case_note, archived)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `)
    .run(
      id,
      id,
      id,
      notes.infoNote ?? null,
      notes.cooperationNote ?? null,
      notes.specialCaseNote ?? null,
    );
  database.close();
}

describe("listNotedSchools", () => {
  it("returns only schools with any school-level note", async () => {
    insertSchool(databaseFile, "a", { infoNote: "有信息备注" });
    insertSchool(databaseFile, "b", { cooperationNote: "有合作备注" });
    insertSchool(databaseFile, "c", { specialCaseNote: "有特殊情况备注" });
    insertSchool(databaseFile, "d", {});
    insertSchool(databaseFile, "e", { infoNote: "  " });

    const { listNotedSchools } = await import("@/lib/queries");
    const result = await listNotedSchools(1, 20);

    const ids = result.rows.map((row) => row.id).sort();
    expect(ids).toEqual(["a", "b", "c"]);
    expect(result.total).toBe(3);
  });

  it("returns note fields for display", async () => {
    insertSchool(databaseFile, "x", { infoNote: "普通备注" });
    insertSchool(databaseFile, "y", { cooperationNote: "机密备注" });

    const { listNotedSchools } = await import("@/lib/queries");
    const result = await listNotedSchools(1, 20);
    const row = result.rows.find((row) => row.id === "x");

    expect(row?.infoNote).toBe("普通备注");
    expect(row?.cooperationNote).toBeNull();
    expect(result.rows.find((row) => row.id === "y")?.cooperationNote).toBe(
      "机密备注",
    );
  });
});
