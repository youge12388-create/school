import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildResults, type ListRow } from "@/lib/ai-screening";
import { candidateRevision } from "@/lib/ai-screening-presentation";
import type { MatchProgram } from "@/lib/matcher";

const mocks = vi.hoisted(() => ({ user: vi.fn(), data: vi.fn(), customers: vi.fn(), db: null as DatabaseSync | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/ai-screening-data", () => ({ loadScreeningData: mocks.data }));
vi.mock("@/lib/queries", () => ({ listCustomerOptions: mocks.customers }));
vi.mock("@/lib/db", () => ({ sqlite: new Proxy({}, { get(_target, key) {
  const value = Reflect.get(mocks.db!, key);
  return typeof value === "function" ? value.bind(mocks.db) : value;
} }) }));

import { GET, POST } from "./route";

const row: ListRow = { name: "示例大学", row: 3, sheet: "春季", yellow: false, fields: [], image: false, noCooperation: false };
const program: MatchProgram = { id: "program-1", schoolId: "school-1", schoolName: "示例大学", schoolTags: null, programName: "计算机硕士", programType: "MASTER", teachingLanguage: "ENGLISH", majorText: "计算机", requirementsText: "不招某国籍", sourceText: null, semesterText: null, applicationTimeText: null, accommodationText: null, firstYearCostMax: 35000, costIncomplete: false, cscaStatus: "UNKNOWN", gpaMin: null, gpaScale: null, hskLevelMin: null, hskScoreMin: null, ieltsMin: null, toeflMin: null, duolingoMin: null, minAge: null, maxAge: null, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN", scholarshipCategory: null, province: null, city: null, partnershipRating: 0, qsRanking: null, reviewStatus: "AUTO_PARSED" };
const criteria = { programType: "MASTER" as const, targetMajor: "计算机", budget: 80000 };
const fixture = () => ({ list: { name: "春季名单.xlsx", rows: [row], schools: 1, missingColumns: [] }, partners: [], schools: [{ id: "school-1", name: "示例大学", preference: "限制某地区学生" }], programs: [program] });
function body() {
  const data = fixture();
  const result = buildResults(data.list.rows, data.programs, data.schools, data.partners, criteria, true, false);
  const card = [...result.confirmed, ...result.pending][0];
  return { requestId: randomUUID(), customerId: "customer-1", title: "选校方案", criteria, source: data.list.name, showOther: false, items: [{ programId: card.programId, revision: candidateRevision(card) }] };
}
function request(data: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/ai-screening/recommendations", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(data) });
}

beforeEach(() => {
  mocks.db?.close();
  mocks.db = new DatabaseSync(":memory:");
  mocks.db.exec(`CREATE TABLE customers (id TEXT PRIMARY KEY, archived INTEGER NOT NULL);
    CREATE TABLE recommendations (id TEXT PRIMARY KEY, customer_id TEXT, created_by TEXT, title TEXT, criteria_json TEXT, notes TEXT, created_at INTEGER);
    CREATE TABLE recommendation_items (id TEXT PRIMARY KEY, recommendation_id TEXT, program_id TEXT, rank INTEGER, fit_level TEXT, reason TEXT, evidence_json TEXT);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, entity_type TEXT, entity_id TEXT, details_json TEXT, ip_address TEXT, created_at INTEGER);
    INSERT INTO customers VALUES ('customer-1', 0), ('archived', 1);`);
  mocks.user.mockReset().mockResolvedValue({ id: "advisor-1", role: "ADMIN" });
  mocks.data.mockReset().mockResolvedValue(fixture());
  mocks.customers.mockReset().mockResolvedValue([{ id: "customer-1", name: "虚构客户", customerNo: "C-1" }]);
});

describe("AI 选校方案保存", () => {
  it("需要登录并拒绝跨站保存", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request(body(), "https://other.example"))).status).toBe(403);
    expect(mocks.data).not.toHaveBeenCalled();
  });
  it("拥有客户查看权限但无方案维护权限时，不能读取保存表单的客户列表或写入方案", async () => {
    mocks.user.mockResolvedValue({ id: "viewer-1", role: "MARKET_MANAGER" });
    expect((await GET()).status).toBe(403);
    expect((await POST(request(body()))).status).toBe(403);
    expect(mocks.customers).not.toHaveBeenCalled();
    expect(mocks.data).not.toHaveBeenCalled();
  });
  it("保存顾问备注，拒绝在备注中记录联系方式", async () => {
    expect((await POST(request({ ...body(), notes: "请优先核实秋季开班。" }))).status).toBe(201);
    expect(mocks.db!.prepare("SELECT notes FROM recommendations").get()).toMatchObject({ notes: "请优先核实秋季开班。" });
    expect((await POST(request({ ...body(), notes: "联系 advisor@example.com 确认可申请。" }))).status).toBe(400);
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM recommendations").get()).toMatchObject({ n: 1 });
  });
  it("保存经过服务端复核的项目和脱敏依据，重复请求不产生第二份方案", async () => {
    const payload = body();
    expect((await POST(request(payload))).status).toBe(201);
    expect((await POST(request(payload))).status).toBe(200);
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM recommendations").get()).toMatchObject({ n: 1 });
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM audit_logs").get()).toMatchObject({ n: 1 });
    const item = mocks.db!.prepare("SELECT program_id AS programId, evidence_json AS evidence FROM recommendation_items").get() as { programId: string; evidence: string };
    expect(item.programId).toBe("program-1");
    expect(item.evidence).toContain("内部注意事项");
    expect(item.evidence).toContain("春季名单.xlsx");
    expect(item.evidence).not.toContain("某国籍");
    expect(item.evidence).not.toContain("某地区");
  });
  it("拒绝已归档客户、过期或伪造的结果，不留下空方案", async () => {
    expect((await POST(request({ ...body(), customerId: "archived" }))).status).toBe(400);
    expect((await POST(request({ ...body(), criteria: {} }))).status).toBe(400);
    const changed = body(); changed.items[0].revision = "伪造";
    expect((await POST(request(changed))).status).toBe(409);
    const wrong = body(); wrong.items[0].programId = "not-a-candidate";
    expect((await POST(request(wrong))).status).toBe(409);
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM recommendations").get()).toMatchObject({ n: 0 });
  });
  it("缺少目标专业依据的项目不能加入方案", async () => {
    const data = fixture(); data.programs = [{ ...program, majorText: null }];
    mocks.data.mockResolvedValue(data);
    const result = buildResults(data.list.rows, data.programs, data.schools, data.partners, criteria, true, false);
    const card = result.pending[0];
    expect(card.quality).toBe("insufficient");
    const payload = { ...body(), items: [{ programId: card.programId, revision: candidateRevision(card) }] };
    expect((await POST(request(payload))).status).toBe(409);
  });
  it("知识库其他院校的保存依据不误标为来自合作名单", async () => {
    const data = fixture();
    data.programs.push({ ...program, id: "other-1", schoolId: "other-school", schoolName: "其他大学", programName: "其他大学硕士", requirementsText: null });
    mocks.data.mockResolvedValue(data);
    const result = buildResults(data.list.rows, data.programs, data.schools, data.partners, criteria, true, true);
    const other = result.other.find((card) => card.programId === "other-1")!;
    const payload = { ...body(), showOther: true, items: [{ programId: other.programId, revision: candidateRevision(other) }] };
    expect((await POST(request(payload))).status).toBe(201);
    const item = mocks.db!.prepare("SELECT evidence_json AS evidence FROM recommendation_items").get() as { evidence: string };
    expect(item.evidence).toContain("知识库项目");
    expect(item.evidence).not.toContain("春季名单.xlsx");
  });
  it("写入审计失败时回滚整份方案", async () => {
    mocks.db!.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'test'); END;");
    expect((await POST(request(body()))).status).toBe(503);
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM recommendations").get()).toMatchObject({ n: 0 });
    expect(mocks.db!.prepare("SELECT COUNT(*) AS n FROM recommendation_items").get()).toMatchObject({ n: 0 });
  });
});
