import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { DatabaseSync } from "node:sqlite";
import * as XLSX from "xlsx";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/app.db");
const outputPath = resolve(process.argv[2] ?? "./data/高校项目维护模板.xlsx");
mkdirSync(resolve(outputPath, ".."), { recursive: true });
const database = new DatabaseSync(databasePath);
const rows = database
  .prepare(
    `SELECT p.id AS 项目ID, s.id AS 学校ID, s.name_zh AS 学校中文名,
            p.program_type AS 项目类型, p.teaching_language AS 授课语言,
            p.tuition_text AS 学费, p.major_text AS 专业列表,
            p.requirements_text AS 申请要求及材料,
            p.application_time_text AS 申请时间说明
     FROM programs p JOIN schools s ON s.id = p.school_id
     WHERE p.archived = 0 ORDER BY s.name_zh, p.program_type`,
  )
  .all();
database.close();
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "项目维护");
XLSX.writeFile(workbook, outputPath);
console.log(`维护模板已生成：${outputPath}`);
