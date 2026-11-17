import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), db: null as DatabaseSync | null }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/db", () => ({ sqlite: new Proxy({}, { get(_target, key) {
  const value = Reflect.get(mocks.db!, key);
  return typeof value === "function" ? value.bind(mocks.db) : value;
} }) }));

import { createApplicationFromRecommendationAction } from "./ai-recommendation-actions";

function form(programId = "program-1") {
  const result = new FormData();
  result.set("recommendationId", "plan-1");
  result.set("programId", programId);
  return result;
}

beforeEach(() => {
  mocks.db?.close();
  mocks.db = new DatabaseSync(":memory:");
  mocks.db.exec(`CREATE TABLE customers (id TEXT PRIMARY KEY, archived INTEGER);
    CREATE TABLE programs (id TEXT PRIMARY KEY, archived INTEGER);
    CREATE TABLE recommendations (id TEXT PRIMARY KEY, customer_id TEXT);
    CREATE TABLE recommendation_items (recommendation_id TEXT, program_id TEXT);
    CREATE TABLE applications (id TEXT PRIMARY KEY, customer_id TEXT, program_id TEXT, owner_id TEXT, status TEXT, notes TEXT, archived INTEGER, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE application_events (id TEXT PRIMARY KEY, application_id TEXT, from_status TEXT, to_status TEXT, reason TEXT, actor_id TEXT, created_at INTEGER);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, entity_type TEXT, entity_id TEXT, details_json TEXT, ip_address TEXT, created_at INTEGER);
    INSERT INTO customers VALUES ('customer-1', 0);
    INSERT INTO programs VALUES ('program-1', 0), ('program-2', 0);
    INSERT INTO recommendations VALUES ('plan-1', 'customer-1');
    INSERT INTO recommendation_items VALUES ('plan-1', 'program-1');`);
  mocks.user.mockReset().mockResolvedValue({ id: "advisor-1" });
});

describe("从选校方案创建申请", () => {
  it("创建一条申请与时间线，重复操作打开原记录", async () => {
    let first = "";
    try { await createApplicationFromRecommendationAction(form()); } catch (error) { first = (error as Error).message; }
    expect(first).toMatch(/^redirect:\/applications\//);
    await expect(createApplicationFromRecommendationAction(form())).rejects.toThrow(first);
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM applications").get()).toMatchObject({ n: 1 });
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM application_events").get()).toMatchObject({ n: 1 });
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM audit_logs").get()).toMatchObject({ n: 1 });
  });
  it("拒绝不在方案内或已归档的项目", async () => {
    await expect(createApplicationFromRecommendationAction(form("program-2"))).rejects.toThrow("方案项目不存在");
    mocks.db!.exec("UPDATE programs SET archived = 1 WHERE id = 'program-1'");
    await expect(createApplicationFromRecommendationAction(form())).rejects.toThrow("方案项目不存在");
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM applications").get()).toMatchObject({ n: 0 });
  });
  it("审计失败时不留下申请或时间线", async () => {
    mocks.db!.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'test'); END;");
    await expect(createApplicationFromRecommendationAction(form())).rejects.toThrow();
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM applications").get()).toMatchObject({ n: 0 });
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM application_events").get()).toMatchObject({ n: 0 });
  });
});
