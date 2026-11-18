import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ sqlite: {} }));

import { getRecommendationFollowUp, listRecommendationRecords } from "./recommendation-records";

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE users (id TEXT, display_name TEXT);
    CREATE TABLE customers (id TEXT, name TEXT, customer_no TEXT, archived INTEGER);
    CREATE TABLE recommendations (id TEXT, customer_id TEXT, created_by TEXT, title TEXT, criteria_json TEXT, created_at INTEGER);
    CREATE TABLE recommendation_items (recommendation_id TEXT, program_id TEXT);
    CREATE TABLE programs (id TEXT, school_id TEXT);
    CREATE TABLE schools (id TEXT, name_zh TEXT);
    CREATE TABLE follow_ups (id TEXT, customer_id TEXT, channel TEXT, content TEXT, next_follow_up_at INTEGER, created_at INTEGER);
    CREATE TABLE audit_logs (action TEXT, entity_id TEXT, details_json TEXT);
    INSERT INTO users VALUES ('advisor-1','顾问甲'), ('advisor-2','顾问乙');
    INSERT INTO customers VALUES ('c1','演示客户','C-DEMO',0), ('c2','演示历史客户','C-PAST',1);
    INSERT INTO recommendations VALUES
      ('plan-a','c1','advisor-1','设计硕士备选','{"mode":"AI_SCREENING"}',200),
      ('plan-b','c2','advisor-2','语言项目','invalid legacy JSON',100);
    INSERT INTO schools VALUES ('school-a','北川大学');
    INSERT INTO programs VALUES ('program-a','school-a');
    INSERT INTO recommendation_items VALUES ('plan-a','program-a'), ('plan-b','program-a');
  `);
});
afterEach(() => database.close());

describe("方案记录", () => {
  it("能按院校或客户编号找回新旧方案，并按实际顾问筛选", () => {
    const { rows } = listRecommendationRecords({ query: "北川", page: 1 }, database);
    expect(rows.map((row) => [row.id, row.mode, row.itemCount, row.customerArchived])).toEqual([
      ["plan-a", "ai", 1, 0], ["plan-b", "manual", 1, 1],
    ]);
    expect(listRecommendationRecords({ query: "c-demo", page: 1 }, database).rows[0]).toMatchObject({ authorName: "顾问甲" });
    expect(listRecommendationRecords({ query: "北川", page: 999, createdBy: "advisor-2" }, database))
      .toMatchObject({ page: 1, total: 1, rows: [{ id: "plan-b" }] });
    expect(listRecommendationRecords({ query: "%", page: 1 }, database).total).toBe(0);
  });

  it("找回旧的截断跟进，并只匹配同一客户下的完整方案编号", () => {
    database.exec(`
      INSERT INTO follow_ups VALUES ('f1','c1','AI 选校','旧记录，末尾被截断',123,1),
        ('f2','c1','AI 选校','方案编号：plan-aa',456,2), ('f3','c2','AI 选校','方案编号：plan-a',789,3);
      INSERT INTO audit_logs VALUES ('SCREENING_FOLLOW_UP_CREATED','c1','invalid'),
        ('SCREENING_FOLLOW_UP_CREATED','c1','{"recommendationId":"plan-a","followUpId":"f1"}');
    `);
    expect(getRecommendationFollowUp("plan-a", "c1", database)).toMatchObject({ id: "f1", nextFollowUpAt: 123 });
    expect(getRecommendationFollowUp("plan-b", "c1", database)).toBeUndefined();
  });
});
