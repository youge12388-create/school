import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  hasPermission: vi.fn(),
  db: null as DatabaseSync | null,
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/access-control", () => ({
  userHasPermission: mocks.hasPermission,
}));
vi.mock("@/lib/db", () => ({
  sqlite: new Proxy(
    {},
    {
      get(_target, key) {
        const value = Reflect.get(mocks.db!, key);
        return typeof value === "function" ? value.bind(mocks.db) : value;
      },
    },
  ),
}));

import { POST } from "./route";

function request(
  body: unknown,
  origin = "http://localhost",
) {
  return new Request("http://localhost/api/ai-screening/follow-up", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.db?.close();
  mocks.db = new DatabaseSync(":memory:");
  mocks.db.exec(`
    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      archived INTEGER NOT NULL DEFAULT 0,
      next_follow_up_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE recommendations (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      title TEXT NOT NULL
    );
    CREATE TABLE recommendation_items (
      id TEXT PRIMARY KEY,
      recommendation_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      evidence_json TEXT NOT NULL
    );
    CREATE TABLE programs (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      deadline_date INTEGER,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE schools (
      id TEXT PRIMARY KEY,
      name_zh TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE follow_ups (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      content TEXT NOT NULL,
      next_follow_up_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO customers (id, archived, next_follow_up_at, updated_at)
      VALUES ('customer-1', 0, NULL, 1), ('archived', 1, NULL, 1);
    INSERT INTO recommendations VALUES
      ('plan-1', 'customer-1', 'advisor-1', '2027 春季方案'),
      ('plan-archived', 'archived', 'advisor-1', '归档方案');
    INSERT INTO schools VALUES ('school-1', '示例大学', 0);
    INSERT INTO programs VALUES
      ('program-1', 'school-1', '计算机硕士', 1, 0);
    INSERT INTO recommendation_items VALUES
      ('item-1', 'plan-1', 'program-1', 1,
        '[{"label":"申请截止","level":"UNKNOWN","detail":"敏感原文"},{"label":"首年预算","level":"NEED","detail":"内部费用"}]');
  `);
  mocks.user.mockReset().mockResolvedValue({
    id: "advisor-1",
    role: "ADVISOR",
  });
  mocks.hasPermission.mockReset().mockReturnValue(true);
});

describe("AI 选校跟进任务", () => {
  it("拒绝跨站请求和未登录用户", async () => {
    expect(
      (await POST(request({ recommendationId: "plan-1" }, "https://evil.example")))
        .status,
    ).toBe(403);
    mocks.user.mockResolvedValueOnce(null);
    expect((await POST(request({ recommendationId: "plan-1" }))).status).toBe(
      401,
    );
  });

  it("缺少跟进维护权限时拒绝创建任务", async () => {
    mocks.hasPermission.mockReturnValueOnce(false);
    expect((await POST(request({ recommendationId: "plan-1" }))).status).toBe(
      403,
    );
    expect(
      mocks.db!.prepare("SELECT COUNT(*) AS count FROM follow_ups").get(),
    ).toMatchObject({ count: 0 });
  });

  it("校验方案和客户，不创建孤儿跟进", async () => {
    expect(
      (await POST(request({ recommendationId: "missing" }))).status,
    ).toBe(404);
    expect(
      (await POST(request({ recommendationId: "plan-archived" }))).status,
    ).toBe(404);
    expect(
      mocks.db!.prepare("SELECT COUNT(*) AS count FROM follow_ups").get(),
    ).toMatchObject({ count: 0 });
  });

  it("按待核实标签创建跟进任务并只推进客户跟进日期", async () => {
    const response = await POST(request({ recommendationId: "plan-1" }));
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.content).toContain("示例大学（计算机硕士）的申请截止、首年预算");
    expect(data.content).not.toContain("敏感原文");
    expect(data.content).not.toContain("内部费用");
    expect(data.content).toContain("方案编号：plan-1");
    expect(
      mocks.db!.prepare(
        "SELECT channel, content FROM follow_ups WHERE customer_id = 'customer-1'",
      ).get(),
    ).toMatchObject({ channel: "AI 选校" });
    expect(
      mocks.db!.prepare(
        "SELECT next_follow_up_at AS nextFollowUpAt FROM customers WHERE id = 'customer-1'",
      ).get(),
    ).toMatchObject({ nextFollowUpAt: data.nextFollowUpAt });
    expect(
      mocks.db!.prepare(
        "SELECT action FROM audit_logs WHERE entity_id = 'customer-1'",
      ).get(),
    ).toMatchObject({ action: "SCREENING_FOLLOW_UP_CREATED" });
  });

  it("重复点击返回同一个跟进任务", async () => {
    const first = await POST(request({ recommendationId: "plan-1" }));
    const created = await first.json();
    const second = await POST(request({ recommendationId: "plan-1" }));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ created: false, id: created.id });
    expect(
      mocks.db!.prepare("SELECT COUNT(*) AS count FROM follow_ups").get(),
    ).toMatchObject({ count: 1 });
  });
});
