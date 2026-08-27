import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { RULE_STATUSES } from "@/lib/constants";
import { sqlite } from "@/lib/db";
import { SCHOOL_EDITOR_ROLES } from "@/lib/permissions";
import { asText } from "@/lib/utils";

function optionalText(value: unknown) {
  const text = asText(value);
  return text || null;
}

function optionalNumber(value: unknown) {
  const text = asText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function changedFields(
  old: Record<string, unknown>,
  updates: Record<string, unknown>,
) {
  const changed: string[] = [];
  for (const key of Object.keys(updates)) {
    if (JSON.stringify(old[key]) !== JSON.stringify(updates[key])) {
      changed.push(key);
    }
  }
  return changed;
}

// 详情页"院校基本信息"卡片就地编辑：只更新基本信息字段
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireRole([...SCHOOL_EDITOR_ROLES]);
  const { id } = await context.params;
  const school = sqlite
    .prepare("SELECT id, name_zh FROM schools WHERE id = ? AND archived = 0")
    .get(id) as { id: string; name_zh: string } | undefined;
  if (!school) {
    return Response.json({ error: "学校不存在" }, { status: 404 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const nameZh = asText(body.nameZh);
  if (!nameZh) {
    return Response.json({ error: "学校中文名不能为空" }, { status: 400 });
  }
  const partnershipRating = optionalNumber(body.partnershipRating) ?? 0;
  const cscaStatus = asText(body.cscaStatus);
  if (!RULE_STATUSES.includes(cscaStatus as never)) {
    return Response.json({ error: "CSCA 状态无效" }, { status: 400 });
  }
  if (partnershipRating < 0 || partnershipRating > 5) {
    return Response.json({ error: "合作星级必须在 0 到 5 之间" }, { status: 400 });
  }

  const updates = {
    nameZh,
    name: optionalText(body.name) || nameZh,
    category: optionalText(body.category),
    province: optionalText(body.province),
    city: optionalText(body.city),
    website: optionalText(body.website),
    partnershipRating,
    cscaStatus: cscaStatus as (typeof RULE_STATUSES)[number],
    qsRanking: optionalNumber(body.qsRanking),
    rankingInfo: optionalText(body.rankingInfo),
    tags: optionalText(body.tags),
    description: optionalText(body.description),
    cooperationPrograms: optionalText(body.cooperationPrograms),
    reviewStatus: "VERIFIED",
  };
  const oldSchool = sqlite
    .prepare(
      "SELECT name_zh AS nameZh, name, category, province, city, website, partnership_rating AS partnershipRating, csca_status AS cscaStatus, qs_ranking AS qsRanking, ranking_info AS rankingInfo, tags, description, cooperation_programs AS cooperationPrograms, review_status AS reviewStatus FROM schools WHERE id = ?",
    )
    .get(id) as Record<string, unknown>;

  sqlite
    .prepare(
      `UPDATE schools SET
       name_zh = ?, name = ?, category = ?, province = ?, city = ?,
       website = ?, partnership_rating = ?, csca_status = ?, qs_ranking = ?,
       ranking_info = ?, tags = ?, description = ?, cooperation_programs = ?,
       review_status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      updates.nameZh,
      updates.name,
      updates.category,
      updates.province,
      updates.city,
      updates.website,
      updates.partnershipRating,
      updates.cscaStatus,
      updates.qsRanking,
      updates.rankingInfo,
      updates.tags,
      updates.description,
      updates.cooperationPrograms,
      updates.reviewStatus,
      Date.now(),
      id,
    );
  writeAudit({
    userId: user.id,
    action: "SCHOOL_UPDATED",
    entityType: "SCHOOL",
    entityId: id,
    details: { nameZh: school.name_zh, changed: changedFields(oldSchool, updates) },
  });
  revalidatePath(`/schools/${id}`);
  revalidatePath("/schools");
  return Response.json({ id });
}
