import { sqlite } from "@/lib/db";

type FeedbackRow = {
  entityId: string | null;
  detailsJson: string | null;
  createdAt: number;
};

export type ScreeningFeedbackValue = "relevant" | "not_relevant";

export function screeningFeedbackScores(
  rows: FeedbackRow[],
) {
  const latest = new Map<string, ScreeningFeedbackValue>();
  for (const row of rows) {
    if (!row.entityId) continue;
    try {
      const value = JSON.parse(row.detailsJson ?? "{}").value;
      if (value === "relevant" || value === "not_relevant") {
        latest.set(row.entityId, value);
      }
    } catch {
      // Ignore malformed audit details rather than changing ranking unexpectedly.
    }
  }
  return new Map(
    [...latest.entries()].map(([programId, value]) => [
      programId,
      value === "relevant" ? 1 : -1,
    ]),
  );
}

export function loadScreeningFeedbackScores(userId: string) {
  const cutoff = Date.now() - 180 * 86_400_000;
  const rows = sqlite
    .prepare(
      `SELECT entity_id AS entityId, details_json AS detailsJson,
        created_at AS createdAt
      FROM audit_logs
      WHERE action = 'SCREENING_FEEDBACK'
        AND user_id = ?
        AND created_at >= ?
        AND entity_id IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 10000`,
    )
    .all(userId, cutoff) as FeedbackRow[];
  return screeningFeedbackScores(rows);
}
