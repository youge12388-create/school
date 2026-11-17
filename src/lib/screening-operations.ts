import { sqlite } from "@/lib/db";

type FeedbackRow = {
  entityId: string | null;
  detailsJson: string | null;
};

function parsedFeedback(rows: FeedbackRow[]) {
  const latest = new Map<string, "relevant" | "not_relevant">();
  for (const row of rows) {
    if (!row.entityId) continue;
    try {
      const value = JSON.parse(row.detailsJson ?? "{}").value;
      if (value === "relevant" || value === "not_relevant") {
        latest.set(row.entityId, value);
      }
    } catch {
      // Ignore malformed historical audit rows.
    }
  }
  return latest;
}

export function getScreeningOperationsOverview() {
  const now = Date.now();
  const last30Days = now - 30 * 86_400_000;
  const quality = sqlite
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN p.manually_verified = 1 AND p.review_status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified,
        SUM(CASE WHEN p.manually_verified = 0 OR p.review_status <> 'VERIFIED' THEN 1 ELSE 0 END) AS unverified,
        SUM(CASE WHEN p.cost_incomplete = 1 OR p.first_year_cost_max IS NULL THEN 1 ELSE 0 END) AS feeMissing,
        SUM(CASE WHEN p.deadline_date IS NOT NULL
          AND p.deadline_date < ?
          AND p.deadline_status <> 'EXPIRED' THEN 1 ELSE 0 END) AS expiredUnmarked,
        SUM(CASE WHEN p.deadline_date IS NULL
          AND COALESCE(TRIM(p.application_time_text), '') = ''
          AND COALESCE(TRIM(p.semester_text), '') = '' THEN 1 ELSE 0 END) AS batchMissing
      FROM programs p
      INNER JOIN schools s ON s.id = p.school_id
      WHERE p.archived = 0 AND s.archived = 0`,
    )
    .get(now) as {
    total: number;
    verified: number | null;
    unverified: number | null;
    feeMissing: number | null;
    expiredUnmarked: number | null;
    batchMissing: number | null;
  };

  const savedPlans = sqlite
    .prepare(
      "SELECT COUNT(*) AS total FROM recommendations WHERE created_at >= ?",
    )
    .get(last30Days) as { total: number };
  const overdueFollowUps = sqlite
    .prepare(
      `SELECT COUNT(*) AS total FROM customers
      WHERE archived = 0 AND next_follow_up_at IS NOT NULL
        AND next_follow_up_at < ?`,
    )
    .get(now) as { total: number };

  const topPrograms = sqlite
    .prepare(
      `SELECT
        p.id AS programId,
        p.name AS programName,
        s.name_zh AS schoolName,
        COUNT(*) AS selectedCount,
        MAX(r.created_at) AS lastSelectedAt
      FROM recommendation_items i
      INNER JOIN recommendations r ON r.id = i.recommendation_id
      INNER JOIN programs p ON p.id = i.program_id
      INNER JOIN schools s ON s.id = p.school_id
      WHERE r.created_at >= ?
      GROUP BY p.id, p.name, s.name_zh
      ORDER BY selectedCount DESC, lastSelectedAt DESC
      LIMIT 10`,
    )
    .all(last30Days) as Array<{
    programId: string;
    programName: string;
    schoolName: string;
    selectedCount: number;
    lastSelectedAt: number;
  }>;

  const feedbackRows = sqlite
    .prepare(
      `SELECT entity_id AS entityId, details_json AS detailsJson
      FROM audit_logs
      WHERE action = 'SCREENING_FEEDBACK' AND created_at >= ?
      ORDER BY created_at ASC
      LIMIT 5000`,
    )
    .all(last30Days) as FeedbackRow[];
  const latestFeedback = parsedFeedback(feedbackRows);
  const feedbackCounts = [...latestFeedback.values()].reduce(
    (counts, value) => {
      counts[value] += 1;
      return counts;
    },
    { relevant: 0, not_relevant: 0 },
  );
  const negativeIds = [...latestFeedback.entries()]
    .filter(([, value]) => value === "not_relevant")
    .map(([programId]) => programId)
    .slice(0, 10);
  let negativePrograms: Array<{
    id: string;
    programName: string;
    schoolName: string;
  }> = [];
  if (negativeIds.length) {
    const placeholders = negativeIds.map(() => "?").join(",");
    negativePrograms = sqlite
      .prepare(
        `SELECT p.id, p.name AS programName, s.name_zh AS schoolName
        FROM programs p
        INNER JOIN schools s ON s.id = p.school_id
        WHERE p.id IN (${placeholders})`,
      )
      .all(...negativeIds) as typeof negativePrograms;
  }

  return {
    quality: {
      total: Number(quality.total ?? 0),
      verified: Number(quality.verified ?? 0),
      unverified: Number(quality.unverified ?? 0),
      feeMissing: Number(quality.feeMissing ?? 0),
      expiredUnmarked: Number(quality.expiredUnmarked ?? 0),
      batchMissing: Number(quality.batchMissing ?? 0),
    },
    savedPlans: Number(savedPlans.total ?? 0),
    overdueFollowUps: Number(overdueFollowUps.total ?? 0),
    topPrograms,
    feedback: {
      ...feedbackCounts,
      total: feedbackCounts.relevant + feedbackCounts.not_relevant,
      negativePrograms,
    },
  };
}
