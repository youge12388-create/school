import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

import { migrateDatabase } from "../src/lib/db/migration";
import { hashPassword } from "../src/lib/password";

async function readPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.stdin.isTTY) return "";

  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk;
  }
  return value.replace(/\r?\n$/, "");
}

async function resetLocalUserPassword(
  username: string,
  password: string,
  database: DatabaseSync,
) {
  const user = database
    .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
    .get(username.trim().toLowerCase()) as { id: string } | undefined;
  if (!user) throw new Error("用户不存在");

  const passwordHash = await hashPassword(password);
  const now = Date.now();
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, now, user.id);
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    database
      .prepare(
        `INSERT INTO audit_logs
         (id, user_id, action, entity_type, entity_id, created_at)
         VALUES (?, ?, 'PASSWORD_RESET_CLI', 'USER', ?, ?)`,
      )
      .run(randomUUID(), user.id, user.id, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function main() {
  const [username] = process.argv.slice(2);
  const password = await readPassword();

  if (!username || !password) {
    throw new Error(
      "用法：通过 ADMIN_PASSWORD 环境变量或标准输入提供密码，再运行 npm run admin:password -- <用户名>",
    );
  }

  const databasePath = migrateDatabase();
  const database = new DatabaseSync(resolve(databasePath));
  database.exec("PRAGMA foreign_keys = ON");
  try {
    await resetLocalUserPassword(username, password, database);
  } finally {
    database.close();
  }

  console.log(`密码已更新并清除旧会话：${username}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
