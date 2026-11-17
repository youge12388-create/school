import { z } from "zod";

import { userHasPermission } from "@/lib/access-control";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";
import {
  screeningFollowUpContent,
  screeningFollowUpDueAt,
  type ScreeningFollowUpItem,
} from "@/lib/screening-follow-up-task";
import { newId } from "@/lib/utils";

const requestSchema = z
  .object({
    recommendationId: z.string().trim().min(1).max(120),
  })
  .strict();

type RecommendationRow = {
  id: string;
  customerId: string;
  title: string;
};

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "请求来源不受信任。" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  if (!userHasPermission(user, "FOLLOW_UP_MANAGE")) {
    return Response.json(
      { error: "当前账号无权创建跟进任务。" },
      { status: 403 },
    );
  }

  let parsed: ReturnType<typeof requestSchema.safeParse>;
  try {
    parsed = requestSchema.safeParse(await request.json());
  } catch {
    return Response.json({ error: "跟进任务内容无效。" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "跟进任务内容无效。" }, { status: 400 });
  }

  try {
    const recommendation = sqlite
      .prepare(
        `SELECT r.id, r.customer_id AS customerId, r.title
        FROM recommendations r
        INNER JOIN customers c ON c.id = r.customer_id
        WHERE r.id = ? AND c.archived = 0`,
      )
      .get(parsed.data.recommendationId) as RecommendationRow | undefined;
    if (!recommendation) {
      return Response.json(
        { error: "选校方案不存在或客户已归档。" },
        { status: 404 },
      );
    }

    const rows = sqlite
      .prepare(
        `SELECT
          s.name_zh AS schoolName,
          p.name AS programName,
          p.deadline_date AS deadlineDate,
          i.evidence_json AS evidenceJson
        FROM recommendation_items i
        INNER JOIN programs p ON p.id = i.program_id
        INNER JOIN schools s ON s.id = p.school_id
        WHERE i.recommendation_id = ?
        ORDER BY i.rank`,
      )
      .all(recommendation.id) as Array<
      ScreeningFollowUpItem & { deadlineDate: number | null }
    >;
    if (!rows.length) {
      return Response.json(
        { error: "方案中没有可跟进的项目。" },
        { status: 400 },
      );
    }

    const content = screeningFollowUpContent({
      recommendationId: recommendation.id,
      title: recommendation.title,
      items: rows,
    });
    const nextFollowUpAt = screeningFollowUpDueAt(
      rows.map((row) => row.deadlineDate),
    );
    const existing = sqlite
      .prepare(
        `SELECT id, content, next_follow_up_at AS nextFollowUpAt
        FROM follow_ups
        WHERE customer_id = ? AND channel = 'AI 选校' AND content LIKE ?
        LIMIT 1`,
      )
      .get(
        recommendation.customerId,
        `%方案编号：${recommendation.id}%`,
      ) as
      | { id: string; content: string; nextFollowUpAt: number | null }
      | undefined;
    if (existing) {
      return Response.json(
        {
          created: false,
          id: existing.id,
          content: existing.content,
          nextFollowUpAt: existing.nextFollowUpAt,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const followUpId = newId();
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite
        .prepare(
          `INSERT INTO follow_ups (
            id, customer_id, author_id, channel, content, next_follow_up_at, created_at
          ) VALUES (?, ?, ?, 'AI 选校', ?, ?, ?)`,
        )
        .run(
          followUpId,
          recommendation.customerId,
          user.id,
          content,
          nextFollowUpAt,
          Date.now(),
        );
      sqlite
        .prepare(
          `UPDATE customers
          SET next_follow_up_at = CASE
            WHEN next_follow_up_at IS NULL OR next_follow_up_at > ? THEN ?
            ELSE next_follow_up_at
          END, updated_at = ?
          WHERE id = ?`,
        )
        .run(nextFollowUpAt, nextFollowUpAt, Date.now(), recommendation.customerId);
      writeAudit(
        {
          userId: user.id,
          action: "SCREENING_FOLLOW_UP_CREATED",
          entityType: "CUSTOMER",
          entityId: recommendation.customerId,
          details: {
            recommendationId: recommendation.id,
            followUpId,
            nextFollowUpAt,
          },
        },
        sqlite,
      );
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
    return Response.json(
      { created: true, id: followUpId, content, nextFollowUpAt },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "跟进任务未创建，请稍后重试。" },
      { status: 503 },
    );
  }
}
