import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

import { migrateDatabase } from "../src/lib/db/migration";
import { hashPassword } from "../src/lib/password";

async function main() {
const [username, displayName, password] = process.argv.slice(2);
if (!username || !displayName || !password) {
  console.error("用法：npm run admin:create -- <用户名> <显示名称> <密码>");
  process.exit(1);
}

const path = migrateDatabase();
const database = new DatabaseSync(resolve(path));
const exists = database
  .prepare("SELECT id FROM users WHERE username = ?")
  .get(username);
if (exists) {
  database.close();
  throw new Error("用户名已存在");
}
database
  .prepare(
    `INSERT INTO users
     (id, username, display_name, password_hash, role, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ADMIN', 1, ?, ?)`,
  )
  .run(
    crypto.randomUUID(),
    username,
    displayName,
    await hashPassword(password),
    Date.now(),
    Date.now(),
  );
database.close();
console.log(`管理员已创建：${username}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
