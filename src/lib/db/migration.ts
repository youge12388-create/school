import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// 迁移前把数据库备份到 backups/migration-<时间戳>/app.db（WAL 全部落盘后
// 用 VACUUM INTO 生成一致性快照），失败只告警不阻断迁移，避免磁盘异常导致停摆。
/**
 * 迁移前快照只在真实运行时生成：测试每次都会新建一次性数据库，
 * 若也写快照会在仓库 backups/ 下堆积成千上万个空文件。
 */
export function shouldSnapshotBeforeMigration(env: Partial<NodeJS.ProcessEnv> = process.env) {
  return env.NODE_ENV !== "test" && !env.VITEST;
}

/** 迁移快照的保留份数（超出后按时间从旧到新清理）。 */
export const MIGRATION_SNAPSHOT_KEEP = 10;

/**
 * 清理超出保留份数的历史迁移快照目录，避免 backups/ 无限增长。
 * 只处理 `migration-<时间戳>` 命名的目录，其他备份（如 before-upgrade-*）不动。
 * 清理失败不阻断迁移：迁移本身已经完成，磁盘问题只记录告警。
 */
export function pruneMigrationSnapshots(backupsRoot: string, keep = MIGRATION_SNAPSHOT_KEEP): number {
  if (keep <= 0) return 0;
  let entries: string[];
  try {
    entries = readdirSync(backupsRoot);
  } catch {
    return 0;
  }
  // 目录名是 `migration-` + 时间戳，字典序即时间序，无需解析日期。
  const snapshots = entries
    .filter((name) => /^migration-\d{8,}$/u.test(name))
    .sort();
  const removable = snapshots.slice(0, Math.max(0, snapshots.length - keep));
  let removed = 0;
  for (const name of removable) {
    const dir = join(backupsRoot, name);
    try {
      for (const file of readdirSync(dir)) {
        try {
          unlinkSync(join(dir, file));
        } catch {
          // 单个文件删不掉时保留，下一轮再试，避免误删同目录其他内容。
        }
      }
      rmdirSync(dir);
      removed += 1;
    } catch {
      // 目录被占用或权限不足时跳过，不影响迁移。
    }
  }
  return removed;
}

function backupBeforeMigration(database: DatabaseSync, databasePath: string) {
  if (!existsSync(databasePath)) return;
  if (!shouldSnapshotBeforeMigration()) return;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "");
  const backupsRoot = resolve(process.cwd(), "backups");
  const backupRoot = resolve(backupsRoot, `migration-${stamp}`);
  try {
    mkdirSync(backupRoot, { recursive: true });
    database.exec("PRAGMA wal_checkpoint(FULL)");
    // VACUUM INTO 要求目标文件不存在；同秒多次迁移（如测试/双实例）时追加序号。
    let target = resolve(backupRoot, "app.db");
    for (let attempt = 0; attempt < 10 && existsSync(target); attempt += 1) {
      target = resolve(backupRoot, `app-${attempt}.db`);
    }
    database.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    console.log(`[migrate] 已备份数据库到 ${target}`);
    const pruned = pruneMigrationSnapshots(backupsRoot);
    if (pruned > 0) console.log(`[migrate] 已清理 ${pruned} 个过期迁移快照（保留最近 ${MIGRATION_SNAPSHOT_KEEP} 份）`);
  } catch (error) {
    // 双实例/测试并发迁移同一库时可能出现 "already exists" 类竞争错误，
    // 迁移本身有 busy_timeout + 幂等保护，此时静默跳过备份即可。
    const message = error instanceof Error ? error.message : "";
    if (!/already exists/.test(message)) {
      console.warn("[migrate] 迁移前备份失败，继续迁移：", error);
    }
  }
}

export function migrateDatabase(databaseFile?: string) {
  const path = resolve(
    databaseFile ?? process.env.DATABASE_PATH ?? "./data/app.db",
  );
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  const migrations = [
    {
      name: "0000_initial",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0000_initial.sql"),
        "utf8",
      ),
    },
    {
      name: "0001_customer_contract_status",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0001_customer_contract_status.sql"),
        "utf8",
      ),
    },
    {
      name: "0002_school_cooperation_fields",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0002_school_cooperation_fields.sql"),
        "utf8",
      ),
    },
    {
      name: "0003_school_updates",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0003_school_updates.sql"),
        "utf8",
      ),
    },
    {
      name: "0004_school_info_note",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0004_school_info_note.sql"),
        "utf8",
      ),
    },
    {
      name: "0005_school_cooperation_fee",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0005_school_cooperation_fee.sql"),
        "utf8",
      ),
    },
    {
      name: "0006_wecom_identity",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0006_wecom_identity.sql"),
        "utf8",
      ),
    },
    {
      name: "0007_wecom_user_access",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0007_wecom_user_access.sql"),
        "utf8",
      ),
    },
    {
      name: "0008_wecom_permissions",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0008_wecom_permissions.sql"),
        "utf8",
      ),
    },
    {
      name: "0009_screening_plans",
      sql: readFileSync(
        resolve(process.cwd(), "drizzle/0009_screening_plans.sql"),
        "utf8",
      ),
    },
  ];

  database.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  let hasPending = false;
  for (const migration of migrations) {
    const applied = database
      .prepare("SELECT name FROM __migrations WHERE name = ?")
      .get(migration.name);
    if (applied) continue;
    hasPending = true;
    break;
  }
  if (hasPending) backupBeforeMigration(database, path);

  for (const migration of migrations) {
    const applied = database
      .prepare("SELECT name FROM __migrations WHERE name = ?")
      .get(migration.name);
    if (applied) continue;

    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database
        .prepare("INSERT INTO __migrations (name, applied_at) VALUES (?, ?)")
        .run(migration.name, Date.now());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  database.close();
  return path;
}
