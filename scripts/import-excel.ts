import { readFileSync } from "node:fs";

import { migrateDatabase } from "../src/lib/db/migration";
import { confirmImport, createImportPreview } from "../src/lib/import-service";

const [schoolPath, programPath] = process.argv.slice(2);
if (!schoolPath || !programPath) {
  console.error("用法：npm run data:import -- <高校汇总.xlsx> <高校项目汇总.xlsx>");
  process.exit(1);
}

migrateDatabase();
const preview = createImportPreview({
  schoolBuffer: readFileSync(schoolPath),
  schoolName: schoolPath,
  programBuffer: readFileSync(programPath),
  programName: programPath,
});
console.log("导入预览：", preview.summary);
const summary = confirmImport(preview.batchId);
console.log("导入完成：", summary);
