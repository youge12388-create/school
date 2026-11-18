import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { writeAudit } from "@/lib/audit";
import { sqlite } from "@/lib/db";
import type { RecommendationProfile } from "@/lib/recommendation-profile";
import { newId } from "@/lib/utils";

type PlanMode = "ai" | "manual";
type RecommendationRow = {
  id: string;
  title: string;
  createdAt: number;
  authorName: string | null;
  studentName: string | null;
  studentRegion: string | null;
  preferredRegion: string | null;
  mode: PlanMode;
};
type RecommendationDetail = RecommendationRow & {
  criteriaJson: string;
  notes: string | null;
  version: number;
};
export type PlanItemSnapshot = {
  programId: string;
  schoolId: string;
  schoolName: string | null;
  schoolRegion: string | null;
  programName: string | null;
  fitLevel: string;
  reason: string | null;
  evidenceJson: string;
  factsJson?: string | null;
};
type SavedPlanItem = PlanItemSnapshot & { id: string; rank: number };

const planColumns = `r.id, r.title, r.created_at AS createdAt, r.mode,
  r.student_name AS studentName, r.student_region AS studentRegion, r.preferred_region AS preferredRegion,
  u.display_name AS authorName`;

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
      instr(lower(r.title), lower(?)) > 0 OR instr(lower(r.student_name), lower(?)) > 0 OR
      instr(lower(r.student_region), lower(?)) > 0 OR instr(lower(r.preferred_region), lower(?)) > 0 OR
      EXISTS (
        SELECT 1 FROM screening_plan_items i WHERE i.plan_id = r.id AND instr(lower(i.school_name), lower(?)) > 0
      )
    )`);
    values.push(needle, needle, needle, needle, needle);
  }
  const from = `FROM screening_plans r LEFT JOIN users u ON u.id = r.created_by
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}`;
  const { total } = database.prepare(`SELECT count(*) AS total ${from}`).get(...values) as { total: number };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(input.page) || 1));
  const rows = database.prepare(`
    SELECT ${planColumns},
      (SELECT count(DISTINCT i.school_id) FROM screening_plan_items i WHERE i.plan_id = r.id) AS schoolCount
    ${from}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ? OFFSET ?
  `).all(...values, pageSize, (page - 1) * pageSize) as unknown as (RecommendationRow & { schoolCount: number })[];
  return { rows, page, pageCount, total };
}

export function getRecommendationRecord(id: string, database: DatabaseSync = sqlite) {
  const plan = database.prepare(`
    SELECT ${planColumns}, r.criteria_json AS criteriaJson, r.notes, r.version
    FROM screening_plans r LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?
  `).get(id) as RecommendationDetail | undefined;
  if (!plan) return undefined;
  const items = database.prepare(`
    SELECT id, rank, program_id AS programId, school_id AS schoolId, school_name AS schoolName,
      school_region AS schoolRegion, program_name AS programName, fit_level AS fitLevel,
      reason, evidence_json AS evidenceJson, facts_json AS factsJson
    FROM screening_plan_items WHERE plan_id = ? ORDER BY rank, id
  `).all(id) as unknown as SavedPlanItem[];
  return { ...plan, items };
}

type SaveIdentity = { id: string; createdBy: string; requestHash: string };

export function hashPlanRequest(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function existingPlanRequest(input: SaveIdentity, database: DatabaseSync = sqlite) {
  const existing = database.prepare("SELECT created_by AS createdBy, request_hash AS requestHash FROM screening_plans WHERE id = ?")
    .get(input.id) as { createdBy: string; requestHash: string | null } | undefined;
  if (!existing) return "missing";
  return existing.createdBy === input.createdBy && existing.requestHash === input.requestHash ? "replayed" : "conflict";
}

export function saveRecommendationRecord(input: SaveIdentity & RecommendationProfile & {
  title: string;
  mode: PlanMode;
  criteriaJson: string;
  items: PlanItemSnapshot[];
}, database: DatabaseSync = sqlite) {
  if (!input.items.length) throw new Error("A plan must have at least one project");
  return transaction(database, () => {
    const existing = existingPlanRequest(input, database);
    if (existing !== "missing") return existing;
    database.prepare(`INSERT INTO screening_plans
      (id, created_by, title, student_name, student_region, preferred_region, notes, mode, criteria_json, request_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.id, input.createdBy, input.title, input.studentName, input.studentRegion || null,
      input.preferredRegion || null, input.notes || null, input.mode, input.criteriaJson, input.requestHash, Date.now());
    const insert = database.prepare(`INSERT INTO screening_plan_items
      (id, plan_id, program_id, school_id, school_name, school_region, program_name, rank, fit_level, reason, evidence_json, facts_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    input.items.forEach((item, index) => {
      insert.run(newId(), input.id, item.programId, item.schoolId, item.schoolName, item.schoolRegion,
        item.programName, index + 1, item.fitLevel, item.reason, item.evidenceJson, item.factsJson ?? null);
    });
    writeAudit({ userId: input.createdBy, action: "RECOMMENDATION_SAVED", entityType: "RECOMMENDATION",
      entityId: input.id, details: { mode: input.mode, schoolCount: new Set(input.items.map((item) => item.schoolId)).size, itemCount: input.items.length } }, database);
    return "created";
  });
}

export function updateRecommendationRecord(
  id: string, version: number, profile: RecommendationProfile, userId: string, database: DatabaseSync = sqlite,
) {
  return transaction(database, () => {
    const current = database.prepare(`SELECT version, student_name AS studentName, student_region AS studentRegion,
      preferred_region AS preferredRegion, notes FROM screening_plans WHERE id = ?`).get(id) as
      | ({ version: number } & { [K in keyof RecommendationProfile]: string | null })
      | undefined;
    if (!current) return "missing";
    if (current.version !== version) return "conflict";
    if ((Object.keys(profile) as (keyof RecommendationProfile)[]).every((key) => (current[key] ?? "") === profile[key])) {
      return "unchanged";
    }
    database.prepare(`UPDATE screening_plans SET student_name = ?, student_region = ?, preferred_region = ?, notes = ?,
      version = version + 1 WHERE id = ?`).run(profile.studentName, profile.studentRegion || null, profile.preferredRegion || null, profile.notes || null, id);
    writeAudit({ userId, action: "RECOMMENDATION_RECORD_UPDATED", entityType: "RECOMMENDATION", entityId: id }, database);
    return "updated";
  });
}

function transaction<T>(database: DatabaseSync, write: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = write();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
