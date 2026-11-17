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

import { GET, POST } from "./route";

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/ai-screening/profile", {
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
      name TEXT NOT NULL,
      customer_no TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      target_degree TEXT,
      target_major TEXT,
      teaching_language TEXT,
      intake_year INTEGER,
      first_year_budget REAL,
      gpa REAL,
      gpa_scale REAL,
      hsk_level INTEGER,
      hsk_score INTEGER,
      ielts REAL,
      toefl INTEGER,
      duolingo INTEGER,
      has_csca INTEGER,
      scholarship_required INTEGER,
      accommodation_required INTEGER,
      preferred_province TEXT,
      preferred_city TEXT,
      updated_at INTEGER
    );
    INSERT INTO customers (
      id, name, customer_no, archived, target_degree, target_major,
      teaching_language, intake_year, first_year_budget, gpa, gpa_scale,
      hsk_level, hsk_score, ielts, toefl, duolingo, has_csca,
      scholarship_required, accommodation_required, preferred_province,
      preferred_city, updated_at
    ) VALUES
      ('customer-1', '脱敏客户', 'C-1', 0, 'MASTER', '计算机', 'ENGLISH',
       2027, 80000, 3.5, 4, 5, 250, 6.5, 90, 120, 0, 1, 1, '北京', '北京', 1),
      ('archived', '归档客户', 'C-2', 1, 'UG', NULL, NULL, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1);
  `);
  mocks.user.mockReset().mockResolvedValue({ id: "advisor-1", role: "ADVISOR" });
  mocks.audit.mockReset();
});

describe("AI 选校客户画像", () => {
  it("读取可映射的客户条件，并明确未持久化字段", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.customers).toHaveLength(1);
    expect(data.customers[0]).toMatchObject({
      id: "customer-1",
      criteria: {
        programType: "MASTER",
        targetMajor: "计算机",
        teachingLanguage: "ENGLISH",
        intakeYear: 2027,
        budget: 80000,
        gpa: 3.5,
        gpaScale: 4,
        hskLevel: 5,
        hskScore: 250,
        ielts: 6.5,
        toefl: 90,
        duolingo: 120,
        hasCsca: false,
        accommodationRequired: true,
        province: "北京",
        city: "北京",
      },
    });
    expect(data.unsupportedFields).toContain("入学季");
  });

  it("拒绝跨站请求，未登录不能读写", async () => {
    expect((await POST(request({}, "https://evil.example"))).status).toBe(403);
    mocks.user.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    mocks.user.mockResolvedValueOnce(null);
    expect(
      (
        await POST(
          request({
            customerId: "customer-1",
            criteria: { programType: "MASTER" },
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("将筛选条件写入客户档案并记录审计", async () => {
    const response = await POST(
      request({
        customerId: "customer-1",
        criteria: {
          programType: "PHD",
          targetMajor: "工程",
          teachingLanguage: "CHINESE",
          intakeYear: 2028,
          budget: 120000,
          gpa: 3.8,
          gpaScale: 4,
          hskLevel: 6,
          hskScore: 270,
          ielts: 7,
          toefl: 100,
          duolingo: 130,
          hasCsca: true,
          scholarshipType: "full",
          accommodationRequired: false,
          province: "上海",
          city: "上海",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CUSTOMER_SCREENING_PROFILE_UPDATED",
        entityId: "customer-1",
      }),
      mocks.db,
    );
    expect(
      mocks.db!
        .prepare(
          `SELECT target_degree AS degree, target_major AS major,
            first_year_budget AS budget, has_csca AS hasCsca,
            preferred_city AS city FROM customers WHERE id = 'customer-1'`,
        )
        .get(),
    ).toMatchObject({
      degree: "PHD",
      major: "工程",
      budget: 120000,
      hasCsca: 1,
      city: "上海",
    });
  });

  it("拒绝归档客户和空条件", async () => {
    expect(
      (
        await POST(
          request({
            customerId: "archived",
            criteria: { programType: "MASTER" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            customerId: "customer-1",
            criteria: {},
          }),
        )
      ).status,
    ).toBe(400);
  });
});
