import * as XLSX from "xlsx";

import { writeAudit } from "@/lib/audit";
import { openRawDatabase } from "@/lib/db/raw";
import { newId } from "@/lib/utils";

export type ParsedSchoolUpdateRow = {
  externalId: string | null;
  title: string | null;
  schoolName: string;
  publicContent: string | null;
  publicUrl: string | null;
  publicUpdatedAt: Date | null;
  publicOperator: string | null;
  secretContent: string | null;
  secretUrl: string | null;
  secretUpdatedAt: Date | null;
  secretOperator: string | null;
  submitter: string | null;
  submittedAt: Date | null;
};

function cellText(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function excelDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  return new Date(
    parsed.y,
    parsed.m - 1,
    parsed.d,
    parsed.H || 0,
    parsed.M || 0,
    parsed.S || 0,
  );
}

export function parseSchoolUpdateWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  const parsed: ParsedSchoolUpdateRow[] = [];
  let skipped = 0;
  for (const row of rows.slice(2)) {
    const schoolName = cellText(row[2]);
    if (!schoolName) {
      skipped += 1;
      continue;
    }
    parsed.push({
      externalId: cellText(row[0]) || null,
      title: cellText(row[1]) || null,
      schoolName,
      publicContent: cellText(row[3]) || null,
      publicUrl: cellText(row[4]) || null,
      publicUpdatedAt: excelDate(row[5]),
      publicOperator: cellText(row[6]) || null,
      secretContent: cellText(row[7]) || null,
      secretUrl: cellText(row[8]) || null,
      secretUpdatedAt: excelDate(row[9]),
      secretOperator: cellText(row[10]) || null,
      submitter: cellText(row[11]) || null,
      submittedAt: excelDate(row[12]),
    });
  }
  return { rows: parsed, skipped };
}

export function importSchoolUpdateRows(
  rows: ParsedSchoolUpdateRow[],
  actorId: string,
  database?: ReturnType<typeof openRawDatabase>,
) {
  const ownsDatabase = database == null;
  const db = database ?? openRawDatabase();
  const summary = {
    imported: 0,
    updated: 0,
    schoolNotFound: 0,
    skipped: 0,
  };
  try {
    for (const row of rows) {
      const school = db
        .prepare(
          "SELECT id FROM schools WHERE name_zh = ? AND archived = 0 LIMIT 1",
        )
        .get(row.schoolName) as { id: string } | undefined;
      if (!school) {
        summary.schoolNotFound += 1;
        continue;
      }
      const now = Date.now();
      const values = {
        title: row.title,
        submitter: row.submitter,
        submittedAt: row.submittedAt?.getTime() ?? null,
        publicContent: row.publicContent,
        publicUrl: row.publicUrl,
        publicOperator: row.publicOperator,
        publicUpdatedAt: row.publicUpdatedAt?.getTime() ?? null,
        secretContent: row.secretContent,
        secretUrl: row.secretUrl,
        secretOperator: row.secretOperator,
        secretUpdatedAt: row.secretUpdatedAt?.getTime() ?? null,
      };
      if (row.externalId) {
        const existing = db
          .prepare("SELECT id FROM school_updates WHERE external_id = ? LIMIT 1")
          .get(row.externalId) as { id: string } | undefined;
        if (existing) {
          db.prepare(
            `UPDATE school_updates SET
               school_id = ?, title = ?, submitter = ?, submitted_at = ?,
               public_content = ?, public_url = ?, public_operator = ?, public_updated_at = ?,
               secret_content = ?, secret_url = ?, secret_operator = ?, secret_updated_at = ?,
               updated_at = ?
             WHERE id = ?`,
          ).run(
            school.id,
            values.title,
            values.submitter,
            values.submittedAt,
            values.publicContent,
            values.publicUrl,
            values.publicOperator,
            values.publicUpdatedAt,
            values.secretContent,
            values.secretUrl,
            values.secretOperator,
            values.secretUpdatedAt,
            now,
            existing.id,
          );
          summary.updated += 1;
          continue;
        }
      }
      db.prepare(
        `INSERT INTO school_updates
         (id, external_id, school_id, title, submitter, submitted_at,
          public_content, public_url, public_operator, public_updated_at,
          secret_content, secret_url, secret_operator, secret_updated_at,
          archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).run(
        newId(),
        row.externalId,
        school.id,
        values.title,
        values.submitter,
        values.submittedAt,
        values.publicContent,
        values.publicUrl,
        values.publicOperator,
        values.publicUpdatedAt,
        values.secretContent,
        values.secretUrl,
        values.secretOperator,
        values.secretUpdatedAt,
        now,
        now,
      );
      summary.imported += 1;
    }
    writeAudit(
      {
        userId: actorId,
        action: "SCHOOL_UPDATES_IMPORTED",
        entityType: "SCHOOL_UPDATE",
        details: summary,
      },
      db,
    );
  } finally {
    if (ownsDatabase) db.close();
  }
  return summary;
}

// “院校信息更新台账”维护模板表头，顺序与 parseSchoolUpdateWorkbook 列索引完全一致。
export const SCHOOL_UPDATE_TEMPLATE_HEADERS = [
  "序号",
  "标题",
  "院校名称",
  "更新内容",
  "网址",
  "更新时间",
  "操作人",
  "机密更新内容",
  "机密网址",
  "机密更新时间",
  "机密操作人",
  "提交人",
  "提交时间",
  "记录更新时间",
] as const;

export const SCHOOL_UPDATE_FIELD_NOTES: ReadonlyArray<{
  column: string;
  required: boolean;
  note: string;
}> = [
  { column: "序号", required: false, note: "可选。填写后作为唯一标识，同一序号再次导入会覆盖更新该条记录。" },
  { column: "标题", required: false, note: "本次更新的标题，例如“招生政策”。" },
  { column: "院校名称", required: true, note: "必填，需与知识库中的学校中文名完全一致，否则该行会被跳过。" },
  { column: "更新内容", required: false, note: "公开可见的更新内容。" },
  { column: "网址", required: false, note: "公开可见的信息来源或附件链接。" },
  { column: "更新时间", required: false, note: "公开内容的更新时间，请填写 Excel 日期或日期时间。" },
  { column: "操作人", required: false, note: "公开内容的更新操作人。" },
  { column: "机密更新内容", required: false, note: "仅高级管理员和数据管理员可见的机密内容。" },
  { column: "机密网址", required: false, note: "机密内容链接。" },
  { column: "机密更新时间", required: false, note: "机密内容的更新时间。" },
  { column: "机密操作人", required: false, note: "机密内容的操作人。" },
  { column: "提交人", required: false, note: "提交本次更新的人员。" },
  { column: "提交时间", required: false, note: "提交时间。" },
  { column: "记录更新时间", required: false, note: "预留列，当前导入流程暂未解析该字段。" },
];

// 模板第 2 行（索引 1）为表头，从第 3 行（索引 2）开始填写数据，
// 与 parseSchoolUpdateWorkbook 的 rows.slice(2) 保持一致。
export function buildSchoolUpdateTemplateBuffer() {
  const workbook = XLSX.utils.book_new();

  const headerCount = SCHOOL_UPDATE_TEMPLATE_HEADERS.length;
  const blankRows = Array.from({ length: 10 }, () =>
    Array.from({ length: headerCount }, () => ""),
  );
  const sheet = XLSX.utils.aoa_to_sheet([
    ["院校信息更新台账"],
    [...SCHOOL_UPDATE_TEMPLATE_HEADERS],
    ...blankRows,
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "院校信息更新");

  const noteRows: (string | number)[][] = [
    ["列名", "是否必填", "说明"],
    ...SCHOOL_UPDATE_FIELD_NOTES.map((field) => [
      field.column,
      field.required ? "必填" : "选填",
      field.note,
    ]),
  ];
  const noteSheet = XLSX.utils.aoa_to_sheet(noteRows);
  XLSX.utils.book_append_sheet(workbook, noteSheet, "字段说明");

  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}
