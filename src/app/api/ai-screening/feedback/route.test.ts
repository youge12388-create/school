import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  audit: vi.fn(),
  db: null as DatabaseSync | null,
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
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

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/ai-screening/feedback", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.db?.close();
  mocks.db = new DatabaseSync(":memory:");
  mocks.db.exec(`
    CREATE TABLE programs (id TEXT PRIMARY KEY, archived INTEGER NOT NULL);
    INSERT INTO programs VALUES ('program-1', 0), ('archived', 1);
  `);
  mocks.user.mockReset().mockResolvedValue({ id: "advisor-1" });
  mocks.audit.mockReset();
});

describe("AI 选校反馈接口", () => {
  it("拒绝跨站、未登录和已归档项目", async () => {
    expect(
      (
        await POST(
          request(
            { programId: "program-1", value: "not_relevant" },
            "https://evil.example",
          ),
        )
      ).status,
    ).toBe(403);
    mocks.user.mockResolvedValueOnce(null);
    expect(
      (
        await POST(
          request({ programId: "program-1", value: "not_relevant" }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          request({ programId: "archived", value: "relevant" }),
        )
      ).status,
    ).toBe(404);
  });

  it("记录反馈到审计日志，供后续排序使用", async () => {
    const response = await POST(
      request({
        programId: "program-1",
        value: "not_relevant",
        reason: "条件不符",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SCREENING_FEEDBACK",
        entityId: "program-1",
        details: { value: "not_relevant", reason: "条件不符" },
      }),
      expect.anything(),
    );
  });
});
