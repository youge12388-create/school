import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AUDIT_ACTION_LABELS,
  formatAuditDetails,
  formatAuditObject,
  writeAudit,
} from "./audit";
import { openRawDatabase } from "./db/raw";

describe("AUDIT_ACTION_LABELS", () => {
  it("SCHOOL_UPDATED 中文标签", () => {
    expect(AUDIT_ACTION_LABELS["SCHOOL_UPDATED"]).toBe("更新学校");
  });

  it("IMPORT_CONFIRMED 中文标签", () => {
    expect(AUDIT_ACTION_LABELS["IMPORT_CONFIRMED"]).toBe("导入确认");
  });

  it("PROGRAM_UPDATED 中文标签", () => {
    expect(AUDIT_ACTION_LABELS["PROGRAM_UPDATED"]).toBe("更新项目");
  });

  it("SCHOOL_UPDATE_DELETED 中文标签", () => {
    expect(AUDIT_ACTION_LABELS["SCHOOL_UPDATE_DELETED"]).toBe("删除院校动态");
  });

  it("SCHOOL_UPDATES_IMPORTED 中文标签", () => {
    expect(AUDIT_ACTION_LABELS["SCHOOL_UPDATES_IMPORTED"]).toBe("导入院校动态");
  });
});

describe("formatAuditObject", () => {
  it("学校编辑包含学校中文名", () => {
    const result = formatAuditObject("SCHOOL", {
      nameZh: "清华大学",
      changed: ["province", "website"],
    });
    expect(result).toBe("学校 清华大学");
  });

  it("项目更新包含项目名称", () => {
    const result = formatAuditObject("PROGRAM", {
      name: "计算机科学硕士",
      changed: ["tuitionText", "ieltsMin"],
    });
    expect(result).toBe("项目 计算机科学硕士");
  });

  it("导入批次无详情时只显示对象类型", () => {
    const result = formatAuditObject("IMPORT_BATCH", null);
    expect(result).toBe("导入批次");
  });

  it("无匹配字段时只返回对象类型", () => {
    const result = formatAuditObject("APPLICATION", { id: "abc" });
    expect(result).toBe("申请");
  });

  it("院校动态包含学校中文名", () => {
    const result = formatAuditObject("SCHOOL_UPDATE", {
      nameZh: "清华大学",
      title: "招生简章更新",
    });
    expect(result).toBe("院校动态 清华大学");
  });
});

describe("formatAuditDetails", () => {
  it("学校编辑显示修改字段列表", () => {
    const result = formatAuditDetails("SCHOOL_UPDATED", {
      nameZh: "清华大学",
      changed: ["province", "website", "partnerShipRating"],
    });
    expect(result).toBe("修改：province、website、partnerShipRating");
  });

  it("项目编辑显示修改字段列表", () => {
    const result = formatAuditDetails("PROGRAM_UPDATED", {
      name: "计算机科学硕士",
      changed: ["tuitionText", "ieltsMin", "gpaMin"],
    });
    expect(result).toBe("修改：tuitionText、ieltsMin、gpaMin");
  });

  it("导入确认显示统计摘要", () => {
    const result = formatAuditDetails("IMPORT_CONFIRMED", {
      created: 5,
      updated: 2,
      skipped: 1,
    });
    expect(result).toBe("新增 5，更新 2，跳过 1");
  });

  it("导入确认只有新增时只显示新增", () => {
    const result = formatAuditDetails("IMPORT_CONFIRMED", {
      created: 3,
      updated: 0,
      skipped: 0,
    });
    expect(result).toBe("新增 3");
  });

  it("无详情时返回 —", () => {
    expect(formatAuditDetails("SCHOOL_UPDATED", null)).toBe("—");
  });

  it("动态导入显示统计摘要", () => {
    const result = formatAuditDetails("SCHOOL_UPDATES_IMPORTED", {
      imported: 6,
      updated: 2,
      skipped: 1,
    });
    expect(result).toBe("导入 6，更新 2，跳过 1");
  });

  it("新建动态显示标题", () => {
    const result = formatAuditDetails("SCHOOL_UPDATE_CREATED", {
      nameZh: "清华大学",
      title: "2026 招生简章",
    });
    expect(result).toBe("《2026 招生简章》");
  });

  it("编辑动态显示标题和修改字段", () => {
    const result = formatAuditDetails("SCHOOL_UPDATE_UPDATED", {
      nameZh: "清华大学",
      title: "2026 招生简章",
      changed: ["publicContent", "secretContent"],
    });
    expect(result).toBe("《2026 招生简章》 修改：publicContent、secretContent");
  });

  it("删除动态无标题时返回中文标签", () => {
    const result = formatAuditDetails("SCHOOL_UPDATE_DELETED", {
      nameZh: "清华大学",
      title: null,
    });
    expect(result).toBe("删除院校动态");
  });

  it("上传附件显示分组与文件名", () => {
    const result = formatAuditDetails("SCHOOL_UPDATE_ATTACHMENT_UPLOADED", {
      nameZh: "清华大学",
      groupName: "SECRET",
      fileName: "录取名单.pdf",
    });
    expect(result).toBe("机密附件：录取名单.pdf");
  });
});

describe("writeAudit", () => {
  it("写入学校编辑审计记录并正确持久化", () => {
    const db = openRawDatabase(":memory:");
    db.exec(`CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    )`);

    writeAudit(
      {
        userId: "user-1",
        action: "SCHOOL_UPDATED",
        entityType: "SCHOOL",
        entityId: "school-1",
        details: { nameZh: "北京大学", changed: ["province"] },
      },
      db,
    );

    const row = db
      .prepare(
        "SELECT action, entity_type AS et, entity_id AS eid, details_json AS dj FROM audit_logs",
      )
      .get() as {
        action: string;
        et: string;
        eid: string;
        dj: string;
      };

    expect(row.action).toBe("SCHOOL_UPDATED");
    expect(row.et).toBe("SCHOOL");
    expect(row.eid).toBe("school-1");
    expect(JSON.parse(row.dj)).toEqual({
      nameZh: "北京大学",
      changed: ["province"],
    });

    db.close();
  });

  it("写入导入确认审计记录", () => {
    const db = openRawDatabase(":memory:");
    db.exec(`CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    )`);

    writeAudit(
      {
        userId: "user-1",
        action: "IMPORT_CONFIRMED",
        entityType: "IMPORT_BATCH",
        entityId: "batch-1",
        details: { created: 5, updated: 3, skipped: 0 },
      },
      db,
    );

    const row = db
      .prepare(
        "SELECT action, entity_type AS et, entity_id AS eid, details_json AS dj FROM audit_logs",
      )
      .get() as {
        action: string;
        et: string;
        eid: string;
        dj: string;
      };

    expect(row.action).toBe("IMPORT_CONFIRMED");
    expect(row.et).toBe("IMPORT_BATCH");
    expect(row.eid).toBe("batch-1");
    expect(JSON.parse(row.dj)).toEqual({ created: 5, updated: 3, skipped: 0 });

    db.close();
  });
});
