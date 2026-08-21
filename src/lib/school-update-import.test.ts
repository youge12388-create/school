import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as XLSX from "xlsx";

vi.mock("server-only", () => ({}));

import { migrateDatabase } from "@/lib/db/migration";
import { openRawDatabase } from "@/lib/db/raw";
import {
  importSchoolUpdateRows,
  parseSchoolUpdateWorkbook,
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
      [
        "data_id",
        "标题",
        "院校名称 School name",
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
        "更新时间",
      ],
      [
        "",
        "",
        "",
        "最新信息更新",
        "",
        "",
        "",
        "",
        "机密信息更新",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        "data-001",
        "招生政策",
        "南宁高中",
        "可以接受一年语言",
        "",
        "https://example.com",
        46237,
        "Mina 郭敏娜",
        "机密备注内容",
        "",
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
    const sheet = XLSX.utils.aoa_to_sheet([
      ["", "", "院校名称"],
      ["", "", ""],
      ["", "", "不存在的学校"],
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
});
