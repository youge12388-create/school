import * as XLSX from "xlsx";

import { writeAudit } from "@/lib/audit";
import { openRawDatabase } from "@/lib/db/raw";
import { newId, safeHttpUrl } from "@/lib/utils";

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
  if (typeof value === "number" && Number.isFinite(value)) {
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
  // Excel 里日期常被填成字符串（如 2026/3/1、2026-03-01 10:30），避免静默丢失。
  const text = cellText(value);
  const match = text.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
  );
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
  );
  return Number.isFinite(date.getTime()) ? date : null;
}

// 网址列只接受 http/https，非 http(s) 内容不再入库（与手工编辑同一规则）。
function sanitizeUrl(value: string): string | null {
  return safeHttpUrl(value);
}

function requireHeaderColumns(
  rows: unknown[][],
  headers: readonly string[],
) {
  const headerRow = rows[1] ?? [];
  const headerIndex = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const name = cellText(cell);
    if (name) headerIndex.set(name, index);
  });
  const missing = headers.filter((header) => !headerIndex.has(header));
  if (missing.length) {
    throw new Error(
      `表头与当前模板不一致（缺少列：${missing.join("、")}）。请下载最新模板后重新填写再导入。`,
    );
  }
  return headerIndex;
}

export function parseSchoolUpdateWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  if (!rows.length || !Array.isArray(rows[1])) {
    throw new Error("文件中没有表头行，请下载最新模板后重新填写再导入。");
  }
  // 旧 15 列模板/自制表头会整行错列甚至覆盖已有记录，必须按当前表头校验。
  const headerIndex = requireHeaderColumns(rows, SCHOOL_UPDATE_TEMPLATE_HEADERS);
  const col = (row: unknown[], name: string) => {
    const index = headerIndex.get(name);
    return index == null ? undefined : row[index];
  };
  const parsed: ParsedSchoolUpdateRow[] = [];
  let skipped = 0;
  for (const row of rows.slice(2)) {
    if (!Array.isArray(row)) continue;
    const schoolName = cellText(col(row, "院校名称"));
    if (!schoolName) {
      skipped += 1;
      continue;
    }
    const publicUrl = sanitizeUrl(cellText(col(row, "网址")));
    const secretUrl = sanitizeUrl(cellText(col(row, "机密网址")));
    parsed.push({
      externalId: cellText(col(row, "序号")) || null,
      title: cellText(col(row, "标题")) || null,
      schoolName,
      publicContent: cellText(col(row, "更新内容")) || null,
      publicUrl,
      publicUpdatedAt: excelDate(col(row, "更新时间")),
      publicOperator: cellText(col(row, "操作人")) || null,
      secretContent: cellText(col(row, "机密更新内容")) || null,
      secretUrl,
      secretUpdatedAt: excelDate(col(row, "机密更新时间")),
      secretOperator: cellText(col(row, "机密操作人")) || null,
      submitter: cellText(col(row, "提交人")) || null,
      submittedAt: excelDate(col(row, "提交时间")),
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
  let rowNumber = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      rowNumber += 1;
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
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    const message = error instanceof Error ? error.message : "未知错误";
    // 数据行从模板第 3 行开始（rows.slice(2)），行号用于定位出错行。
    throw new Error(`台账导入失败（第 ${rowNumber + 2} 行附近）：${message}`);
  } finally {
    if (ownsDatabase) db.close();
  }
  return summary;
}

// “院校信息更新台账”维护模板表头。导入解析按表头名映射列，
// 顺序调整不影响解析；表头缺失/变更会直接拒绝导入。
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
  { column: "网址", required: false, note: "公开可见的信息来源或附件链接，仅支持 http/https。" },
  { column: "更新时间", required: false, note: "公开内容的更新时间，请填写 Excel 日期或日期时间。" },
  { column: "操作人", required: false, note: "公开内容的更新操作人。" },
  { column: "机密更新内容", required: false, note: "仅高级管理员和数据管理员可见的机密内容。" },
  { column: "机密网址", required: false, note: "机密内容链接，仅支持 http/https。" },
  { column: "机密更新时间", required: false, note: "机密内容的更新时间。" },
  { column: "机密操作人", required: false, note: "机密内容的操作人。" },
  { column: "提交人", required: false, note: "提交本次更新的人员。" },
  { column: "提交时间", required: false, note: "提交时间。" },
  { column: "记录更新时间", required: false, note: "预留列，当前导入流程暂未解析该字段。" },
];

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
