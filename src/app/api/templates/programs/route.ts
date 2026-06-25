import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as XLSX from "xlsx";

import { requireRole } from "@/lib/auth";
import { openRawDatabase } from "@/lib/db/raw";

export async function GET() {
  await requireRole(["ADMIN", "DATA_MANAGER"]);
  const database = openRawDatabase();
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
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows),
    "项目维护",
  );
  const tempDir = resolve("./data/temp");
  mkdirSync(tempDir, { recursive: true });
  const tempPath = resolve(tempDir, `program-template-${Date.now()}.xlsx`);
  XLSX.writeFile(workbook, tempPath);
  const buffer = readFileSync(tempPath);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename*=UTF-8''program-maintenance.xlsx",
      "Cache-Control": "no-store",
    },
  });
}
