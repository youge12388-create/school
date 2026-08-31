import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as XLSX from "xlsx";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireRole: async () => ({ id: "user-import", role: "ADMIN" }),
}));

import { migrateDatabase } from "@/lib/db/migration";
import { openRawDatabase } from "@/lib/db/raw";
import { SCHOOL_UPDATE_TEMPLATE_HEADERS } from "@/lib/school-update-import";
import { POST } from "@/app/api/school-updates/import/route";
import { GET as getTemplate } from "@/app/api/templates/school-updates/route";

describe("school update excel import api", () => {
  let tempDir: string;
  let tempDb: string;
  let previousDatabasePath: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "school-update-api-"));
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
    previousDatabasePath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = tempDb;
  });

  afterEach(async () => {
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  function uploadFile(buffer: Buffer, name = "school-updates.xlsx") {
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(buffer)], name, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    return new Request("http://localhost/api/school-updates/import", {
      method: "POST",
      body: formData,
    });
  }

  function filledWorkbook() {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["院校信息更新台账"],
      [...SCHOOL_UPDATE_TEMPLATE_HEADERS],
      [
        "api-001",
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

  it("accepts a multipart Excel upload, imports it and reports skipped rows", async () => {
    const response = await POST(uploadFile(filledWorkbook()));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      summary: {
        imported: number;
        updated: number;
        schoolNotFound: number;
        skipped: number;
        skippedRows: number;
      };
    };
    expect(body.summary).toMatchObject({
      imported: 1,
      updated: 0,
      schoolNotFound: 0,
      skipped: 0,
      skippedRows: 0,
    });

    const db = openRawDatabase(tempDb);
    const row = db
      .prepare(
        "SELECT external_id AS externalId, school_id AS schoolId FROM school_updates WHERE external_id = ? LIMIT 1",
      )
      .get("api-001") as { externalId: string; schoolId: string };
    expect(row.externalId).toBe("api-001");
    expect(row.schoolId).toBe("school-1");
    db.close();
  });

  it("rejects unsupported file types", async () => {
    const response = await POST(uploadFile(Buffer.from("plain text"), "notes.csv"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("仅支持 .xlsx 或 .xls 格式");
  });

  it("returns a maintenance template workbook", async () => {
    const response = await getTemplate();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    const buffer = Buffer.from(await response.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["院校信息更新", "字段说明"]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets["院校信息更新"],
      { header: 1, raw: true, defval: "" },
    );
    expect(rows[1]).toEqual([...SCHOOL_UPDATE_TEMPLATE_HEADERS]);
  });
});
