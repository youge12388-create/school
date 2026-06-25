import { migrateDatabase } from "../src/lib/db/migration";

const path = migrateDatabase();
console.log(`数据库迁移完成：${path}`);
