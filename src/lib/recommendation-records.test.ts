import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ sqlite: {} }));

import {
  existingPlanRequest,
  getRecommendationRecord,
  hashPlanRequest,
  listRecommendationRecords,
  saveRecommendationRecord,
  updateRecommendationRecord,
} from "./recommendation-records";

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE users (id TEXT, display_name TEXT);
    CREATE TABLE screening_plans (
      id TEXT PRIMARY KEY, created_by TEXT, title TEXT, student_name TEXT, student_region TEXT,
      preferred_region TEXT, notes TEXT, mode TEXT, criteria_json TEXT, request_hash TEXT,
      version INTEGER DEFAULT 0, created_at INTEGER
    );
    CREATE TABLE screening_plan_items (
      id TEXT PRIMARY KEY, plan_id TEXT, program_id TEXT, school_id TEXT, school_name TEXT,
      school_region TEXT, program_name TEXT, rank INTEGER, fit_level TEXT, reason TEXT,
      evidence_json TEXT, facts_json TEXT
    );
    CREATE TABLE audit_logs (
      id TEXT, user_id TEXT, action TEXT, entity_type TEXT, entity_id TEXT,
      details_json TEXT, ip_address TEXT, created_at INTEGER
    );
    INSERT INTO users VALUES ('advisor-1','顾问甲'), ('advisor-2','顾问乙');
    INSERT INTO screening_plans VALUES
      ('plan-a','advisor-1','设计硕士备选','林同学','泰国','广东 · 深圳','优先确认奖学金','ai','{}',NULL,0,200),
      ('plan-b','advisor-2','语言项目','周同学','越南','浙江 · 杭州','','manual','invalid legacy JSON',NULL,0,100);
    INSERT INTO screening_plan_items VALUES
      ('item-1','plan-a','program-a','school-a','北川大学','广东 · 深圳','设计学硕士',1,'MATCHED',NULL,'[]',NULL),
      ('item-2','plan-a','program-b','school-a','北川大学','广东 · 深圳','交互设计硕士',2,'NEEDS_ACTION',NULL,'[]',NULL),
      ('item-3','plan-a','program-c','school-b','南溪大学','广东 · 广州','视觉传达硕士',3,'UNKNOWN',NULL,'[]',NULL),
      ('item-4','plan-b','program-d','school-c','西河大学','浙江 · 杭州','汉语进修',1,'MATCHED',NULL,'[]',NULL);
  `);
});
afterEach(() => database.close());

describe("方案记录", () => {
  it("能按院校、姓名和地区检索方案，同一学校多个项目只计一所", () => {
    const { rows } = listRecommendationRecords({ query: "北川", page: 1 }, database);
    expect(rows.map((row) => [row.id, row.mode, row.schoolCount, row.studentName])).toEqual([
      ["plan-a", "ai", 2, "林同学"],
    ]);
    expect(listRecommendationRecords({ query: "林同学", page: 1 }, database).rows[0]).toMatchObject({ id: "plan-a", authorName: "顾问甲" });
    expect(listRecommendationRecords({ query: "浙江", page: 1 }, database).rows[0]).toMatchObject({ id: "plan-b", preferredRegion: "浙江 · 杭州" });
    expect(listRecommendationRecords({ query: "北川", page: 999, createdBy: "advisor-2" }, database))
      .toMatchObject({ page: 1, total: 0, rows: [] });
    expect(listRecommendationRecords({ query: "%", page: 1 }, database).total).toBe(0);
  });

  it("读取完整方案快照，并按院校顺序保留同校多个项目", () => {
    expect(getRecommendationRecord("plan-a", database)).toMatchObject({
      studentName: "林同学",
      studentRegion: "泰国",
      preferredRegion: "广东 · 深圳",
      notes: "优先确认奖学金",
      items: [
        { programId: "program-a", schoolName: "北川大学", rank: 1 },
        { programId: "program-b", schoolName: "北川大学", rank: 2 },
        { programId: "program-c", schoolName: "南溪大学", rank: 3 },
      ],
    });
    expect(getRecommendationRecord("missing", database)).toBeUndefined();
  });

  it("保存方案与服务端请求指纹，重复请求返回已保存状态", () => {
    const payload = {
      id: "plan-new",
      createdBy: "advisor-1",
      requestHash: hashPlanRequest({ title: "新方案" }),
      title: "新方案",
      studentName: "陈同学",
      studentRegion: "马来西亚",
      preferredRegion: "上海",
      notes: "核实截止日期",
      mode: "manual" as const,
      criteriaJson: "{}",
      items: [
        {
          programId: "program-x",
          schoolId: "school-x",
          schoolName: "东湖大学",
          schoolRegion: "上海",
          programName: "工商管理硕士",
          fitLevel: "NEEDS_ACTION",
          reason: "补交语言成绩",
          evidenceJson: "[]",
        },
        {
          programId: "program-y",
          schoolId: "school-x",
          schoolName: "东湖大学",
          schoolRegion: "上海",
          programName: "国际商务硕士",
          fitLevel: "MATCHED",
          reason: null,
          evidenceJson: "[]",
        },
      ],
    };
    expect(saveRecommendationRecord(payload, database)).toBe("created");
    expect(saveRecommendationRecord(payload, database)).toBe("replayed");
    expect(existingPlanRequest({
      id: "plan-new",
      createdBy: "advisor-1",
      requestHash: payload.requestHash,
    }, database)).toBe("replayed");
    expect(existingPlanRequest({
      id: "plan-new",
      createdBy: "advisor-2",
      requestHash: payload.requestHash,
    }, database)).toBe("conflict");
    expect(getRecommendationRecord("plan-new", database)?.items).toHaveLength(2);
    expect(database.prepare("SELECT details_json FROM audit_logs").get()).toMatchObject({
      details_json: JSON.stringify({ mode: "manual", schoolCount: 1, itemCount: 2 }),
    });
  });

  it("编辑学生基础信息时校验版本，并拒绝覆盖其他会话的更新", () => {
    expect(updateRecommendationRecord("plan-a", 0, {
      studentName: "林同学（更新）",
      studentRegion: "泰国 · 曼谷",
      preferredRegion: "广东 · 广州",
      notes: "已确认预算",
    }, "advisor-1", database)).toBe("updated");
    expect(getRecommendationRecord("plan-a", database)).toMatchObject({
      version: 1,
      studentRegion: "泰国 · 曼谷",
      notes: "已确认预算",
    });
    expect(updateRecommendationRecord("plan-a", 1, {
      studentName: "林同学（更新）",
      studentRegion: "泰国 · 曼谷",
      preferredRegion: "广东 · 广州",
      notes: "已确认预算",
    }, "advisor-1", database)).toBe("unchanged");
    expect(updateRecommendationRecord("plan-a", 0, {
      studentName: "旧会话",
      studentRegion: "",
      preferredRegion: "",
      notes: "",
    }, "advisor-1", database)).toBe("conflict");
    expect(updateRecommendationRecord("missing", 0, {
      studentName: "不存在",
      studentRegion: "",
      preferredRegion: "",
      notes: "",
    }, "advisor-1", database)).toBe("missing");
  });
});
