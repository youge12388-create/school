import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  resolve(process.cwd(), "drizzle/0009_screening_plans.sql"),
  "utf8",
);

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT);
    CREATE TABLE customers (
      id TEXT PRIMARY KEY, name TEXT, preferred_province TEXT, preferred_city TEXT
    );
    CREATE TABLE recommendations (
      id TEXT PRIMARY KEY, customer_id TEXT, created_by TEXT, title TEXT,
      criteria_json TEXT, notes TEXT, created_at INTEGER
    );
    CREATE TABLE recommendation_items (
      id TEXT PRIMARY KEY, recommendation_id TEXT, program_id TEXT, rank INTEGER,
      fit_level TEXT, reason TEXT, evidence_json TEXT
    );
    CREATE TABLE programs (
      id TEXT PRIMARY KEY, school_id TEXT, name TEXT, program_type TEXT,
      teaching_language TEXT, major_text TEXT, tuition_text TEXT,
      first_year_cost_max REAL, deadline_date INTEGER
    );
    CREATE TABLE schools (
      id TEXT PRIMARY KEY, name_zh TEXT, province TEXT, city TEXT
    );

    INSERT INTO users VALUES ('advisor-1', '顾问甲');
    INSERT INTO customers VALUES
      ('customer-1', '张同学', '北京', '海淀'),
      ('customer-2', '李同学', '浙江', '杭州');
    INSERT INTO schools VALUES
      ('school-a', '北川大学', '广东', '深圳'),
      ('school-b', '南溪大学', '广东', '广州');
    INSERT INTO programs VALUES
      ('program-a', 'school-a', '设计学硕士', 'MASTER', 'ENGLISH', '设计学', '3.5 万', 35000, 1893456000000),
      ('program-b', 'school-a', '交互设计硕士', 'MASTER', 'ENGLISH', '交互设计', '3.8 万', 38000, 1893456000000),
      ('program-c', 'school-b', '视觉传达硕士', 'MASTER', 'CHINESE', '视觉传达', '3.2 万', 32000, 1893456000000);

    INSERT INTO recommendations VALUES
      ('plan-a', 'customer-1', 'advisor-1', '设计硕士备选',
        '{"mode":"AI_SCREENING","criteria":{"nationality":"泰国","province":"上海","city":"浦东"},"recordProfile":{"studentName":"林同学","preferredRegion":"广东 · 广州"}}',
        '优先核实奖学金', 200),
      ('plan-b', 'customer-2', 'advisor-1', '语言项目', 'invalid legacy JSON', '', 100);
    INSERT INTO recommendation_items VALUES
      ('item-1', 'plan-a', 'program-a', 1, 'MATCHED', '符合目标专业', '[{"label":"专业"}]'),
      ('item-2', 'plan-a', 'program-b', 2, 'NEEDS_ACTION', '补交语言成绩', '[]'),
      ('item-3', 'plan-a', 'program-c', 3, 'UNKNOWN', '待核实', '[]'),
      ('item-4', 'plan-b', 'program-a', 1, 'MATCHED', '语言项目', '[]');
  `);
});

afterEach(() => database.close());

describe("0009 方案记录迁移", () => {
  it("保留旧方案 ID 和链接，并把客户资料与筛选条件写入独立方案表", () => {
    database.exec(migrationSql);

    const plans = database.prepare(`
      SELECT id, title, student_name AS studentName, student_region AS studentRegion,
        preferred_region AS preferredRegion, notes, mode
      FROM screening_plans ORDER BY id
    `).all();
    expect(plans).toEqual([
      {
        id: "plan-a",
        title: "设计硕士备选",
        studentName: "林同学",
        studentRegion: null,
        preferredRegion: "广东 · 广州",
        notes: "优先核实奖学金",
        mode: "ai",
      },
      {
        id: "plan-b",
        title: "语言项目",
        studentName: "李同学",
        studentRegion: null,
        preferredRegion: "浙江 · 杭州",
        notes: "",
        mode: "manual",
      },
    ]);
  });

  it("旧国籍不会误填学生所在地，手工方案保留可核对的院校快照", () => {
    database.exec(migrationSql);

    expect(database.prepare(
      "SELECT student_region AS studentRegion, criteria_json AS criteriaJson FROM screening_plans WHERE id = 'plan-a'",
    ).get()).toMatchObject({
      studentRegion: null,
      criteriaJson: expect.stringContaining('"nationality":"泰国"'),
    });
    expect(database.prepare(`
      SELECT school_id AS schoolId, school_name AS schoolName, program_name AS programName,
        rank, facts_json AS factsJson
      FROM screening_plan_items WHERE plan_id = 'plan-b'
    `).get()).toMatchObject({
      schoolId: "school-a",
      schoolName: "北川大学",
      programName: "设计学硕士",
      rank: 1,
      factsJson: expect.stringContaining('"firstYearCostMax":35000'),
    });
  });

  it("同校多个项目迁移后仍只按学校计数", () => {
    database.exec(migrationSql);

    expect(database.prepare(`
      SELECT count(DISTINCT school_id) AS schoolCount, count(*) AS itemCount
      FROM screening_plan_items WHERE plan_id = 'plan-a'
    `).get()).toEqual({ schoolCount: 2, itemCount: 3 });
  });
});
