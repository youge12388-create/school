import { createHash } from "node:crypto";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { buildResults, criteriaSchema, type ResultCard } from "@/lib/ai-screening";
import { loadScreeningData } from "@/lib/ai-screening-data";
import { containsPersonalContact, containsSensitiveRestriction } from "@/lib/ai-screening-input";
import { candidateRevision, isCandidate } from "@/lib/ai-screening-presentation";
import { sqlite } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";
import { listCustomerOptions } from "@/lib/queries";
import { newId } from "@/lib/utils";

export const runtime = "nodejs";
const saveSchema = z.object({
  requestId: z.string().uuid(), customerId: z.string().min(1).max(120), title: z.string().trim().min(1).max(80),
  criteria: criteriaSchema, source: z.string().min(1).max(120), showOther: z.boolean(),
  items: z.array(z.object({ programId: z.string().min(1).max(120), revision: z.string().max(12000) }).strict()).min(1).max(30),
}).strict();

async function readLimited(request: Request, limit: number) {
  if (!request.body || Number(request.headers.get("content-length") || 0) > limit) throw new Error("request too large");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error("request too large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function safeEvidence(card: ResultCard, source: string) {
  const safe = (text: string) => containsSensitiveRestriction(text) || containsPersonalContact(text) ? "涉及内部信息，请人工核实" : text;
  const points = card.points.map((point) => ({ label: point.label, level: point.level, detail: safe(point.text) }));
  const cooperation = card.cooperation === "not_cooperating" ? "名单标注不合作，需核实" : card.cooperation === "unknown" ? "其他院校，合作状态待核实" : card.cooperation === "project_confirmed" ? "内部台账有项目合作记录，仍需核实有效期" : "学校在合作名单中，项目合作及收益需核实";
  return [
    { label: "合作状态", level: "NEED", detail: cooperation },
    ...points,
    { label: "来源", level: "UNKNOWN", detail: safe([...(card.cooperation === "unknown" ? [] : [source]), ...card.sources].join("、")) },
    ...(card.warning.length ? [{ label: "内部注意事项", level: "NEED", detail: "需联系有权限的同事人工核实" }] : []),
    ...(card.image ? [{ label: "原表图片", level: "UNKNOWN", detail: "图片内容未识别，需人工查看" }] : []),
  ];
}

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: "请先登录。" }, { status: 401 });
  try { return Response.json({ customers: await listCustomerOptions() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "无法读取客户列表，请稍后重试。" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不受信任。" }, { status: 403 });
  let parsed: ReturnType<typeof saveSchema.safeParse>;
  try {
    const text = await readLimited(request, 256_000);
    parsed = saveSchema.safeParse(JSON.parse(text));
  } catch { return Response.json({ error: "保存内容无效，请重新选择项目。" }, { status: 400 }); }
  if (!parsed.success) return Response.json({ error: "请选择客户和有效项目，再保存方案。" }, { status: 400 });
  const data = parsed.data;
  if (!Object.values(data.criteria).some((value) => value != null && value !== "")) return Response.json({ error: "请先提供申请条件并重新检索。" }, { status: 400 });
  const ids = data.items.map((item) => item.programId);
  if (new Set(ids).size !== ids.length) return Response.json({ error: "同一项目不能重复选择。" }, { status: 400 });
  const textValues = [data.title, ...Object.values(data.criteria).filter((value): value is string => typeof value === "string")];
  if (textValues.some((value) => containsPersonalContact(value) || containsSensitiveRestriction(value))) return Response.json({ error: "方案名称或条件包含需移除的个人信息或敏感限制。" }, { status: 400 });
  const requestHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  try {
    const existing = sqlite.prepare("SELECT created_by AS createdBy, customer_id AS customerId, criteria_json AS criteriaJson FROM recommendations WHERE id = ?").get(data.requestId) as { createdBy: string; customerId: string; criteriaJson: string } | undefined;
    if (existing) {
      let oldHash: string | undefined;
      try { oldHash = JSON.parse(existing.criteriaJson)?.requestHash; } catch { /* Existing non-AI plan. */ }
      if (existing.createdBy === user.id && existing.customerId === data.customerId && oldHash === requestHash) return Response.json({ id: data.requestId, customerId: data.customerId });
      return Response.json({ error: "这次保存请求已使用，请重新提交。" }, { status: 409 });
    }
    const customer = sqlite.prepare("SELECT id FROM customers WHERE id = ? AND archived = 0").get(data.customerId);
    if (!customer) return Response.json({ error: "客户不存在或已归档，请重新选择。" }, { status: 400 });
    const { list, partners, schools, programs } = await loadScreeningData();
    if (list.name !== data.source) return Response.json({ error: "合作名单已更新，请重新检索后再保存。" }, { status: 409 });
    const results = buildResults(list.rows, programs, schools, partners, data.criteria, user.role === "ADMIN" || user.role === "DATA_MANAGER", data.showOther);
    const byId = new Map([...results.confirmed, ...results.pending, ...results.other].filter(isCandidate).map((card) => [card.programId, card]));
    const selected = data.items.map((item) => ({ item, card: byId.get(item.programId) }));
    if (selected.some(({ item, card }) => !card || candidateRevision(card) !== item.revision)) return Response.json({ error: "项目资料或匹配结果已变化，请重新检索后再保存。" }, { status: 409 });
    const criteriaJson = JSON.stringify({ mode: "AI_SCREENING", criteria: data.criteria, source: list.name, requestHash });
    const now = Date.now();
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const duplicate = sqlite.prepare("SELECT created_by AS createdBy, customer_id AS customerId, criteria_json AS criteriaJson FROM recommendations WHERE id = ?").get(data.requestId) as { createdBy: string; customerId: string; criteriaJson: string } | undefined;
      if (duplicate) {
        let oldHash: string | undefined;
        try { oldHash = JSON.parse(duplicate.criteriaJson)?.requestHash; } catch { /* Existing non-AI plan. */ }
        sqlite.exec("COMMIT");
        return duplicate.createdBy === user.id && duplicate.customerId === data.customerId && oldHash === requestHash
          ? Response.json({ id: data.requestId, customerId: data.customerId })
          : Response.json({ error: "这次保存请求已使用，请重新提交。" }, { status: 409 });
      }
      // Recheck the customer inside the transaction so an archived record cannot receive a new plan.
      if (!sqlite.prepare("SELECT id FROM customers WHERE id = ? AND archived = 0").get(data.customerId)) throw new Error("客户不存在或已归档，请重新选择。");
      sqlite.prepare("INSERT INTO recommendations (id, customer_id, created_by, title, criteria_json, notes, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)").run(data.requestId, data.customerId, user.id, data.title, criteriaJson, now);
      const insert = sqlite.prepare("INSERT INTO recommendation_items (id, recommendation_id, program_id, rank, fit_level, reason, evidence_json) VALUES (?, ?, ?, ?, ?, NULL, ?)");
      selected.forEach(({ card }, index) => {
        const item = card!;
        insert.run(newId(), data.requestId, item.programId!, index + 1, item.fit === "已知条件符合" ? "MATCHED" : "UNKNOWN", JSON.stringify(safeEvidence(item, list.name)));
      });
      writeAudit({ userId: user.id, action: "RECOMMENDATION_SAVED", entityType: "RECOMMENDATION", entityId: data.requestId, details: { customerId: data.customerId, itemCount: selected.length } }, sqlite);
      sqlite.exec("COMMIT");
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    return Response.json({ id: data.requestId, customerId: data.customerId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "方案未保存，请检查数据后重试。" }, { status: 503 }); }
}
