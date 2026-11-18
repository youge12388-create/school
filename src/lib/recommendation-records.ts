import type { DatabaseSync } from "node:sqlite";

import { sqlite } from "@/lib/db";

export type RecommendationRecord = {
  id: string;
  title: string;
  createdAt: number;
  createdBy: string;
  authorName: string;
  customerName: string;
  customerNo: string;
  customerArchived: number;
  itemCount: number;
  mode: "ai" | "manual";
};

export function listRecommendationRecords(
  input: { query: string; page: number; createdBy?: string },
  database: DatabaseSync = sqlite,
) {
  const pageSize = 20;
  const needle = input.query.trim().slice(0, 100);
  const filters: string[] = [];
  const values: string[] = [];
  if (input.createdBy) {
    filters.push("r.created_by = ?");
    values.push(input.createdBy);
  }
  if (needle) {
    filters.push(`(
      instr(lower(r.title), lower(?)) > 0 OR
      instr(lower(c.name), lower(?)) > 0 OR
      instr(lower(c.customer_no), lower(?)) > 0 OR
      EXISTS (
        SELECT 1 FROM recommendation_items i
        JOIN programs p ON p.id = i.program_id
        JOIN schools s ON s.id = p.school_id
        WHERE i.recommendation_id = r.id AND instr(lower(s.name_zh), lower(?)) > 0
      )
    )`);
    values.push(needle, needle, needle, needle);
  }
  const from = `FROM recommendations r
    JOIN customers c ON c.id = r.customer_id
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}`;
  const { total } = database.prepare(`SELECT count(*) AS total ${from}`).get(...values) as { total: number };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(input.page) || 1));
  const rows = database.prepare(`
    SELECT r.id, r.title, r.created_at AS createdAt, r.created_by AS createdBy,
      COALESCE((SELECT display_name FROM users WHERE id = r.created_by), '') AS authorName,
      c.name AS customerName, c.customer_no AS customerNo, c.archived AS customerArchived,
      (SELECT count(*) FROM recommendation_items i WHERE i.recommendation_id = r.id) AS itemCount,
      CASE WHEN json_valid(r.criteria_json) THEN
        CASE WHEN json_extract(r.criteria_json, '$.mode') = 'AI_SCREENING' THEN 'ai' ELSE 'manual' END
      ELSE 'manual' END AS mode
    ${from}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ? OFFSET ?
  `).all(...values, pageSize, (page - 1) * pageSize) as unknown as RecommendationRecord[];
  return { rows, page, pageCount, total };
}

export function getRecommendationFollowUp(
  recommendationId: string,
  customerId: string,
  database: DatabaseSync = sqlite,
) {
  const marker = `方案编号：${recommendationId}`;
  return database.prepare(`
    SELECT f.id, f.content, f.next_follow_up_at AS nextFollowUpAt
    FROM follow_ups f
    WHERE f.customer_id = ? AND f.channel = 'AI 选校'
      AND (substr(f.content, -length(?)) = ? OR EXISTS (
        SELECT 1 FROM audit_logs log
        WHERE log.action = 'SCREENING_FOLLOW_UP_CREATED' AND log.entity_id = f.customer_id
          AND CASE WHEN json_valid(log.details_json) THEN
            json_extract(log.details_json, '$.recommendationId') = ?
            AND json_extract(log.details_json, '$.followUpId') = f.id
          ELSE 0 END
      ))
    ORDER BY f.created_at DESC
    LIMIT 1
  `).get(customerId, marker, marker, recommendationId) as
    | { id: string; content: string; nextFollowUpAt: number | null }
    | undefined;
}
