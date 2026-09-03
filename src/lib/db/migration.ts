import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// 迁移前把数据库备份到 backups/migration-<时间戳>/app.db（WAL 全部落盘后
// 用 VACUUM INTO 生成一致性快照），失败只告警不阻断迁移，避免磁盘异常导致停摆。
function backupBeforeMigration(database: DatabaseSync, databasePath: string) {
  if (!existsSync(databasePath)) return;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "");
  const backupRoot = resolve(process.cwd(), "backups", `migration-${stamp}`);
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
