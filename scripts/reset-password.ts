import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

import { migrateDatabase } from "../src/lib/db/migration";
import { resetUserPassword } from "../src/lib/user-service";

async function readPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.stdin.isTTY) return "";

  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk;
  }
  return value.replace(/\r?\n$/, "");
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
    await resetUserPassword(username, password, database);
  } finally {
    database.close();
  }

  console.log(`密码已更新并清除旧会话：${username}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
