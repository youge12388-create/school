import { z } from "zod";

import { getUserPermissions } from "@/lib/access-control";
import { getCurrentUser } from "@/lib/auth";
import { buildResults, criteriaSchema, type ResultCard } from "@/lib/ai-screening";
import { loadScreeningData } from "@/lib/ai-screening-data";
import { candidateRevision, displayProgramName, isCandidate } from "@/lib/ai-screening-presentation";
import { isSameOrigin } from "@/lib/http";
import { MAX_PLAN_ITEMS, planRegion } from "@/lib/recommendation-profile";
import { existingPlanRequest, hashPlanRequest, saveRecommendationRecord } from "@/lib/recommendation-records";
import { hasPrivatePlanText, planIdField, planProfileFields, planRequestField, planTitleField, safePlanEvidence } from "@/lib/recommendation-validation";

export const runtime = "nodejs";

const saveSchema = z.object({
  ...planProfileFields,
  requestId: planRequestField, title: planTitleField,
  criteria: criteriaSchema, source: z.string().min(1).max(120), showOther: z.boolean(),
  items: z.array(z.object({ programId: planIdField, revision: z.string().min(1).max(12000) }).strict()).min(1).max(MAX_PLAN_ITEMS),
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
  const points = card.points.map((point) => ({ label: point.label, level: point.level, detail: safePlanEvidence(point.text) }));
  const cooperation = card.cooperation === "not_cooperating" ? "名单标注不合作，需核实" : card.cooperation === "unknown" ? "其他院校，合作状态待核实" : card.cooperation === "project_confirmed" ? "内部台账有项目合作记录，仍需核实有效期" : "学校在合作名单中，项目合作及收益需核实";
  return [
    { label: "合作状态", level: "NEED", detail: cooperation },
    ...points,
    { label: "来源", level: "UNKNOWN", detail: safePlanEvidence([...(card.cooperation === "unknown" ? [] : [source]), ...card.sources].join("、")) },
    ...(card.warning.length ? [{ label: "内部注意事项", level: "NEED", detail: "需联系有权限的同事人工核实" }] : []),
    ...(card.image ? [{ label: "原表图片", level: "UNKNOWN", detail: "图片内容未识别，需人工查看" }] : []),
  ];
}

const conflict = () => Response.json({ error: "这次保存请求已使用，请重新提交。" }, { status: 409 });
const success = (id: string, status: number) => Response.json({ id }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不受信任。" }, { status: 403 });
  const permissions = getUserPermissions(user);
  if (!permissions.includes("SCREENING_VIEW") || !permissions.includes("RECOMMENDATION_MANAGE")) {
    return Response.json({ error: "当前账号无权保存方案。" }, { status: 403 });
  }

  let parsed: ReturnType<typeof saveSchema.safeParse>;
  try {
    parsed = saveSchema.safeParse(JSON.parse(await readLimited(request, 512_000)));
  } catch {
    return Response.json({ error: "保存内容无效，请重新选择项目。" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "请填写学生姓名和方案名称、选择有效项目，并检查地区和备注长度。" }, { status: 400 });
  }
  const { requestId, title, studentName, studentRegion, preferredRegion, notes, criteria, source, showOther, items } = parsed.data;
  if (!Object.values(criteria).some((value) => value != null && value !== "")) {
    return Response.json({ error: "请先提供申请条件并重新检索。" }, { status: 400 });
  }
  if (new Set(items.map((item) => item.programId)).size !== items.length) {
    return Response.json({ error: "同一项目不能重复选择。" }, { status: 400 });
  }
  if (hasPrivatePlanText([title, studentName, studentRegion, preferredRegion, notes, ...Object.values(criteria)])) {
    return Response.json({ error: "请移除方案中的联系方式、证件信息或敏感限制。" }, { status: 400 });
  }

  const identity = { id: requestId, createdBy: user.id, requestHash: hashPlanRequest({ mode: "ai", ...parsed.data }) };
  try {
    const previous = existingPlanRequest(identity);
    if (previous === "replayed") return success(requestId, 200);
    if (previous === "conflict") return conflict();

    const { list, partners, schools, programs } = await loadScreeningData();
    if (list.name !== source) return Response.json({ error: "合作名单已更新，请重新检索后再保存。" }, { status: 409 });
    const results = buildResults(list.rows, programs, schools, partners, criteria, permissions.includes("SCHOOL_VIEW_CONFIDENTIAL"), showOther);
    const byId = new Map([...results.confirmed, ...results.pending, ...results.other].filter(isCandidate).map((card) => [card.programId, card]));
    const programsById = new Map(programs.map((program) => [program.id, program]));
    const snapshots = [];
    for (const item of items) {
      const card = byId.get(item.programId);
      const program = programsById.get(item.programId);
      if (!program || !card || candidateRevision(card) !== item.revision) {
        return Response.json({ error: "项目资料或匹配结果已变化，请重新检索后再保存。" }, { status: 409 });
      }
      snapshots.push({
        programId: program.id,
        schoolId: program.schoolId,
        schoolName: card.name,
        schoolRegion: planRegion(program.province, program.city) || null,
        programName: displayProgramName(card.name, card.program),
        fitLevel: card.fit === "已知条件符合" ? "MATCHED" : "UNKNOWN",
        reason: null,
        evidenceJson: JSON.stringify(safeEvidence(card, list.name)),
      });
    }
    const result = saveRecommendationRecord({
      ...identity, title, studentName, studentRegion, preferredRegion, notes,
      mode: "ai", criteriaJson: JSON.stringify({ mode: "AI_SCREENING", criteria, source: list.name }),
      items: snapshots,
    });
    return result === "conflict" ? conflict() : success(requestId, result === "created" ? 201 : 200);
  } catch {
    return Response.json({ error: "方案未保存，请稍后重试。" }, { status: 503 });
  }
}
