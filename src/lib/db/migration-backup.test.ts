import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase, pruneMigrationSnapshots, shouldSnapshotBeforeMigration } from "./migration";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("迁移前的数据库快照", () => {
  it("测试运行时跳过快照，避免污染仓库 backups/ 目录", () => {
    expect(shouldSnapshotBeforeMigration({ NODE_ENV: "test" })).toBe(false);
    expect(shouldSnapshotBeforeMigration({ VITEST: "true" })).toBe(false);
    expect(shouldSnapshotBeforeMigration({ NODE_ENV: "test", VITEST: "true" })).toBe(false);
  });

  it("真实运行时保留迁移前快照", () => {
    expect(shouldSnapshotBeforeMigration({ NODE_ENV: "production" })).toBe(true);
    expect(shouldSnapshotBeforeMigration({ NODE_ENV: "development" })).toBe(true);
    expect(shouldSnapshotBeforeMigration({})).toBe(true);
  });

  it("跳过快照时迁移本身仍完整执行且可重复运行", () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-migration-basic-"));
    try {
      const databasePath = join(dir, "app.db");
      expect(migrateDatabase(databasePath)).toBe(databasePath);
      // 幂等：第二次调用不应重复应用迁移，也不应抛错。
      expect(migrateDatabase(databasePath)).toBe(databasePath);
      const db = new DatabaseSync(databasePath);
      try {
        const row = db.prepare("SELECT COUNT(*) AS cnt FROM __migrations").get() as { cnt: number };
        expect(row.cnt).toBeGreaterThan(0);
        const pending = db.prepare("SELECT COUNT(*) AS cnt FROM __migrations WHERE name = ?")
          .get("0000_initial") as { cnt: number };
        expect(pending.cnt).toBe(1);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // 两次完整迁移在并行测试负载下可能超过默认 5s，这里显式放宽。
  }, 60_000);
});

describe("迁移快照自动轮转", () => {
  function seedSnapshots(root: string, names: string[]) {
    mkdirSync(root, { recursive: true });
    for (const name of names) {
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(join(root, name, "app.db"), "x");
    }
  }

  it("只保留最近的指定份数，按时间从旧到新删除", () => {
    const root = mkdtempSync(join(tmpdir(), "school-syt-prune-"));
    try {
      seedSnapshots(root, [
        "migration-20261119023734027",
        "migration-20261120023734027",
        "migration-20261123023734027",
        "migration-20261125023734027",
        "migration-20261126023734027",
      ]);
      expect(pruneMigrationSnapshots(root, 2)).toBe(3);
      expect(existsSync(join(root, "migration-20261126023734027"))).toBe(true);
      expect(existsSync(join(root, "migration-20261125023734027"))).toBe(true);
      expect(existsSync(join(root, "migration-20261119023734027"))).toBe(false);
      expect(existsSync(join(root, "migration-20261123023734027"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("不动非迁移命名的备份目录", () => {
    const root = mkdtempSync(join(tmpdir(), "school-syt-prune-keep-"));
    try {
      seedSnapshots(root, [
        "migration-20261119023734027",
        "migration-20261120023734027",
        "migration-20261121023734027",
        "before-upgrade-20261118",
      ]);
      pruneMigrationSnapshots(root, 1);
      // 升级前快照必须原样保留，它不是迁移快照。
      expect(existsSync(join(root, "before-upgrade-20261118"))).toBe(true);
      expect(existsSync(join(root, "migration-20261121023734027"))).toBe(true);
      expect(existsSync(join(root, "migration-20261119023734027"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("目录不存在或份数未超限时不做任何事", () => {
    const root = mkdtempSync(join(tmpdir(), "school-syt-prune-noop-"));
    try {
      expect(pruneMigrationSnapshots(join(root, "missing"), 3)).toBe(0);
      seedSnapshots(root, ["migration-20261119023734027"]);
      expect(pruneMigrationSnapshots(root, 3)).toBe(0);
      expect(existsSync(join(root, "migration-20261119023734027"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
