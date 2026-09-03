import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as XLSX from "xlsx";

vi.mock("server-only", () => ({}));

import { migrateDatabase } from "@/lib/db/migration";
import { openRawDatabase } from "@/lib/db/raw";
import {
  buildSchoolUpdateTemplateBuffer,
  importSchoolUpdateRows,
  parseSchoolUpdateWorkbook,
  SCHOOL_UPDATE_TEMPLATE_HEADERS,
} from "@/lib/school-update-import";

describe("school update excel import", () => {
  let tempDir: string;
  let tempDb: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "school-update-import-"));
    tempDb = join(tempDir, "app.db");
    migrateDatabase(tempDb);
    const db = openRawDatabase(tempDb);
    const now = Date.now();
    db.prepare(
      `INSERT INTO users
       (id, username, display_name, password_hash, role, active, created_at, updated_at)
       VALUES (?, 'import-user', '导入员', 'unused', 'DATA_MANAGER', 1, ?, ?)`,
    ).run("user-import", now, now);
    db.prepare(
      "INSERT INTO schools (id, name_zh, name, archived, created_at, updated_at) VALUES (?, '南宁高中', '南宁高中', 0, ?, ?)",
    ).run("school-1", now, now);
    db.close();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function workbookBuffer() {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["院校信息更新台账"],
      [...SCHOOL_UPDATE_TEMPLATE_HEADERS],
      [
        "data-001",
        "招生政策",
        "南宁高中",
        "可以接受一年语言",
        "https://example.com",
        46237,
        "Mina 郭敏娜",
        "机密备注内容",
        "https://example.com/secret",
        46237.5,
        "Sammi 张云云",
        "Mina 郭敏娜",
        46237.6,
        "",
      ],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "院校信息更新");
    return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  }

  it("parses both public and secret groups with dates", () => {
    const parsed = parseSchoolUpdateWorkbook(workbookBuffer());
    expect(parsed.rows).toHaveLength(1);
    const row = parsed.rows[0];
    expect(row.externalId).toBe("data-001");
    expect(row.schoolName).toBe("南宁高中");
    expect(row.publicContent).toBe("可以接受一年语言");
    expect(row.publicOperator).toBe("Mina 郭敏娜");
    expect(row.secretContent).toBe("机密备注内容");
    expect(row.secretOperator).toBe("Sammi 张云云");
    expect(row.submitter).toBe("Mina 郭敏娜");
    expect(row.publicUpdatedAt?.getFullYear()).toBe(2026);
    expect(row.secretUpdatedAt).not.toBeNull();
    expect(row.submittedAt).not.toBeNull();
  });

  it("imports rows into the database with secret fields intact", () => {
    const parsed = parseSchoolUpdateWorkbook(workbookBuffer());
    const db = openRawDatabase(tempDb);
    const summary = importSchoolUpdateRows(parsed.rows, "user-import", db);
    expect(summary).toMatchObject({ imported: 1, schoolNotFound: 0 });
    const row = db
      .prepare(
        "SELECT public_content AS publicContent, secret_content AS secretContent, submitter FROM school_updates LIMIT 1",
      )
      .get() as { publicContent: string; secretContent: string; submitter: string };
    expect(row.publicContent).toBe("可以接受一年语言");
    expect(row.secretContent).toBe("机密备注内容");
    expect(row.submitter).toBe("Mina 郭敏娜");
    db.close();
  });

  it("skips schools that are not in the knowledge base", () => {
    const blank = () => Array.from({ length: SCHOOL_UPDATE_TEMPLATE_HEADERS.length }, () => "");
    const sheet = XLSX.utils.aoa_to_sheet([
      ["院校信息更新台账"],
      [...SCHOOL_UPDATE_TEMPLATE_HEADERS],
      ["", "", "不存在的学校", ...blank().slice(3)],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "院校信息更新");
    const parsed = parseSchoolUpdateWorkbook(
      XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }),
    );
    const db = openRawDatabase(tempDb);
    const summary = importSchoolUpdateRows(parsed.rows, "user-import", db);
    expect(summary).toMatchObject({ imported: 0, schoolNotFound: 1 });
    db.close();
  });

  it("rejects workbooks whose headers do not match the current template", () => {
    // 旧 15 列模板（含“附件”列）或自制表头必须被拒绝，避免整行错列/串写。
    const sheet = XLSX.utils.aoa_to_sheet([
      ["院校信息更新台账"],
      [
        "序号",
        "标题",
        "院校名称",
        "更新内容",
        "附件",
        "网址",
        "更新时间",
        "操作人",
        "机密更新内容",
        "机密附件",
        "机密网址",
        "机密更新时间",
        "机密操作人",
        "提交人",
        "提交时间",
      ],
      ["data-001", "招生政策", "南宁高中"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "院校信息更新");
    expect(() =>
      parseSchoolUpdateWorkbook(
        XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }),
      ),
    ).toThrow(/请下载最新模板/);
  });

  it("parses dates typed as text strings instead of dropping them", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["院校信息更新台账"],
      [...SCHOOL_UPDATE_TEMPLATE_HEADERS],
      ["data-text-date", "", "南宁高中", "", "", "2026-03-01 10:30", "", "", "", "", "", "", "2026/3/5", ""],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "院校信息更新");
    const parsed = parseSchoolUpdateWorkbook(
      XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }),
    );
    expect(parsed.rows).toHaveLength(1);
    const row = parsed.rows[0];
    expect(row.publicUpdatedAt?.getFullYear()).toBe(2026);
    expect(row.publicUpdatedAt?.getHours()).toBe(10);
    expect(row.submittedAt?.getMonth()).toBe(2); // 2026-03-05
  });

  it("builds a maintenance template with headers and no data rows", () => {
    const buffer = buildSchoolUpdateTemplateBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    expect(workbook.SheetNames[0]).toBe("院校信息更新");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets["院校信息更新"],
      { header: 1, raw: true, defval: "" },
    );
    expect(rows[0][0]).toBe("院校信息更新台账");
    expect(rows[1]).toEqual([...SCHOOL_UPDATE_TEMPLATE_HEADERS]);
    // 模板没有数据行，解析后应为空，避免误导入示例数据。
    expect(parseSchoolUpdateWorkbook(buffer).rows).toHaveLength(0);
    // 字段说明表应包含必填列。
    const notes = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets["字段说明"],
      { header: 1, raw: true, defval: "" },
    );
    expect(notes[0]).toEqual(["列名", "是否必填", "说明"]);
    expect(notes.some((note) => note[0] === "院校名称" && note[1] === "必填")).toBe(
      true,
    );
  });

  it("imports a row filled into the downloaded template", () => {
    const buffer = buildSchoolUpdateTemplateBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets["院校信息更新"];
    XLSX.utils.sheet_add_aoa(
      sheet,
      [
        [
          "template-001",
          "招生政策",
          "南宁高中",
          "可以接受一年语言",
          "https://example.com",
          46237,
          "Mina 郭敏娜",
          "机密备注内容",
          "https://example.com/secret",
          46237.5,
          "Sammi 张云云",
          "Mina 郭敏娜",
          46237.6,
          "",
        ],
      ],
      { origin: "A3" },
    );
    const filled = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const parsed = parseSchoolUpdateWorkbook(filled);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].externalId).toBe("template-001");
    expect(parsed.rows[0].schoolName).toBe("南宁高中");
    expect(parsed.rows[0].publicContent).toBe("可以接受一年语言");

    const db = openRawDatabase(tempDb);
    const summary = importSchoolUpdateRows(parsed.rows, "user-import", db);
    expect(summary).toMatchObject({ imported: 1, schoolNotFound: 0 });
    const row = db
      .prepare(
        "SELECT external_id AS externalId, public_content AS publicContent FROM school_updates WHERE external_id = ? LIMIT 1",
      )
      .get("template-001") as { externalId: string; publicContent: string };
    expect(row.externalId).toBe("template-001");
    expect(row.publicContent).toBe("可以接受一年语言");
    db.close();
  });
});
