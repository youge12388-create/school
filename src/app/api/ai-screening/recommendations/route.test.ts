import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildResults, type ListRow } from "@/lib/ai-screening";
import { candidateRevision } from "@/lib/ai-screening-presentation";
import type { MatchProgram } from "@/lib/matcher";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  data: vi.fn(),
  db: null as DatabaseSync | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/ai-screening-data", () => ({ loadScreeningData: mocks.data }));
vi.mock("@/lib/db", () => ({
  sqlite: new Proxy({}, {
    get(_target, key) {
      const value = Reflect.get(mocks.db!, key);
      return typeof value === "function" ? value.bind(mocks.db) : value;
    },
  }),
}));

import { POST } from "./route";

const row: ListRow = {
  name: "示例大学",
  row: 3,
  sheet: "春季",
  yellow: false,
  fields: [],
  image: false,
  noCooperation: false,
};
const program: MatchProgram = {
  id: "program-1",
  schoolId: "school-1",
  schoolName: "示例大学",
  schoolTags: null,
  programName: "计算机硕士",
  programType: "MASTER",
  teachingLanguage: "ENGLISH",
  majorText: "计算机",
  requirementsText: "不招某国籍",
  sourceText: null,
  semesterText: null,
  applicationTimeText: null,
  accommodationText: null,
  firstYearCostMax: 35000,
  costIncomplete: false,
  cscaStatus: "UNKNOWN",
  gpaMin: null,
  gpaScale: null,
  hskLevelMin: null,
  hskScoreMin: null,
  ieltsMin: null,
  toeflMin: null,
  duolingoMin: null,
  minAge: null,
  maxAge: null,
  deadlineDate: new Date("2099-01-01T00:00:00Z"),
  deadlineStatus: "OPEN",
  scholarshipCategory: null,
  province: null,
  city: null,
  partnershipRating: 0,
  qsRanking: null,
  reviewStatus: "AUTO_PARSED",
};
const criteria = { programType: "MASTER" as const, targetMajor: "计算机", budget: 80000 };

function fixture() {
  return {
    list: { name: "春季名单.xlsx", rows: [row], schools: 1, missingColumns: [] },
    partners: [],
    schools: [{ id: "school-1", name: "示例大学", preference: "限制某地区学生" }],
    programs: [program],
  };
}

function body() {
  const data = fixture();
  const result = buildResults(data.list.rows, data.programs, data.schools, data.partners, criteria, true, false);
  const card = [...result.confirmed, ...result.pending][0];
  return {
    requestId: randomUUID(),
    title: "三校申请方案",
    studentName: "林同学",
    studentRegion: "泰国",
    preferredRegion: "广东 · 深圳",
    notes: "",
    criteria,
    source: data.list.name,
    showOther: false,
    items: [{ programId: card.programId, revision: candidateRevision(card) }],
  };
}

function request(data: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/ai-screening/recommendations", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(data),
  });
}

beforeEach(() => {
  mocks.db?.close();
  mocks.db = new DatabaseSync(":memory:");
  mocks.db.exec(`
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
  `);
  mocks.user.mockReset().mockResolvedValue({
    id: "advisor-1",
    role: "ADMIN",
    authProvider: "LOCAL",
  });
  mocks.data.mockReset().mockResolvedValue(fixture());
});

describe("AI 选校方案保存", () => {
  it("需要登录并拒绝跨站保存", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await POST(request(body(), "https://other.example"))).status).toBe(401);
    expect((await POST(request(body(), "https://other.example"))).status).toBe(403);
    expect(mocks.data).not.toHaveBeenCalled();
  });

  it("只有学校筛查权限而没有方案维护权限时不能保存", async () => {
    mocks.user.mockResolvedValue({
      id: "viewer-1",
      role: "MARKET_MANAGER",
      authProvider: "LOCAL",
    });
    expect((await POST(request(body()))).status).toBe(403);
    expect(mocks.data).not.toHaveBeenCalled();
  });

  it("保存学生基础信息和顾问备注，拒绝联系方式", async () => {
    expect((await POST(request({ ...body(), notes: "请优先核实秋季开班。" }))).status).toBe(201);
    expect(mocks.db!.prepare(
      "SELECT student_name AS studentName, student_region AS studentRegion, preferred_region AS preferredRegion, notes FROM screening_plans",
    ).get()).toMatchObject({
      studentName: "林同学",
      studentRegion: "泰国",
      preferredRegion: "广东 · 深圳",
      notes: "请优先核实秋季开班。",
    });
    expect((await POST(request({ ...body(), notes: "联系 advisor@example.com 确认可申请。" }))).status).toBe(400);
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM screening_plans").get()).toMatchObject({ n: 1 });
  });

  it("服务端复核项目并保存脱敏依据，重复请求不产生第二份方案", async () => {
    const payload = body();
    expect((await POST(request(payload))).status).toBe(201);
    expect((await POST(request(payload))).status).toBe(200);
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM screening_plans").get()).toMatchObject({ n: 1 });
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM audit_logs").get()).toMatchObject({ n: 1 });
    const item = mocks.db!.prepare(
      "SELECT program_id AS programId, evidence_json AS evidence FROM screening_plan_items",
    ).get() as { programId: string; evidence: string };
    expect(item.programId).toBe("program-1");
    expect(item.evidence).toContain("内部注意事项");
    expect(item.evidence).toContain("春季名单.xlsx");
    expect(item.evidence).not.toContain("某国籍");
    expect(item.evidence).not.toContain("某地区");
  });

  it("拒绝空条件、过期修订和被篡改的项目", async () => {
    expect((await POST(request({ ...body(), criteria: {} }))).status).toBe(400);
    const changed = body();
    changed.items[0].revision = "伪造";
    expect((await POST(request(changed))).status).toBe(409);
    const wrong = body();
    wrong.items[0].programId = "not-a-candidate";
    expect((await POST(request(wrong))).status).toBe(409);
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM screening_plans").get()).toMatchObject({ n: 0 });
  });

  it("缺少目标专业依据的项目不能加入方案", async () => {
    const data = fixture();
    data.programs = [{ ...program, majorText: null }];
    mocks.data.mockResolvedValue(data);
    const result = buildResults(data.list.rows, data.programs, data.schools, data.partners, criteria, true, false);
    const card = result.pending[0];
    expect(card.quality).toBe("insufficient");
    const payload = {
      ...body(),
      items: [{ programId: card.programId, revision: candidateRevision(card) }],
    };
    expect((await POST(request(payload))).status).toBe(409);
  });

  it("知识库其他院校的保存依据不误标为合作名单来源", async () => {
    const data = fixture();
    data.programs.push({
      ...program,
      id: "other-1",
      schoolId: "other-school",
      schoolName: "其他大学",
      programName: "其他大学硕士",
      requirementsText: null,
    });
    mocks.data.mockResolvedValue(data);
    const result = buildResults(data.list.rows, data.programs, data.schools, data.partners, criteria, true, true);
    const other = result.other.find((card) => card.programId === "other-1")!;
    const payload = {
      ...body(),
      showOther: true,
      items: [{ programId: other.programId, revision: candidateRevision(other) }],
    };
    expect((await POST(request(payload))).status).toBe(201);
    const item = mocks.db!.prepare(
      "SELECT evidence_json AS evidence FROM screening_plan_items",
    ).get() as { evidence: string };
    expect(item.evidence).toContain("知识库项目");
    expect(item.evidence).not.toContain("春季名单.xlsx");
  });

  it("写入审计失败时回滚整份方案", async () => {
    mocks.db!.exec(
      "CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'test'); END;",
    );
    expect((await POST(request(body()))).status).toBe(503);
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM screening_plans").get()).toMatchObject({ n: 0 });
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM screening_plan_items").get()).toMatchObject({ n: 0 });
  });
});
