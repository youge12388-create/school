import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_MAJOR_SYNONYMS } from "@/lib/constants";
import {
  parseProgramWorkbook,
  parseSchoolWorkbook,
  type ProgramImportRow,
  type SchoolImportRow,
} from "@/lib/excel-import";
import { openRawDatabase } from "@/lib/db/raw";
import { findMajorCategory } from "@/lib/program-parser";
import { newId, normalizeKeyword } from "@/lib/utils";

type PreviewEntry = {
  key: string;
  action: "NEW" | "MODIFIED" | "DUPLICATE" | "CONFLICT";
  details: string;
};

export type ImportPreview = {
  batchId: string;
  sourceNames: string[];
  schools: SchoolImportRow[];
  programs: ProgramImportRow[];
  summary: {
    schools: Record<PreviewEntry["action"], number>;
    programs: Record<PreviewEntry["action"], number>;
    sourceDuplicates: number;
    needsReview: number;
  };
  entries: PreviewEntry[];
};

const emptyCounts = () => ({ NEW: 0, MODIFIED: 0, DUPLICATE: 0, CONFLICT: 0 });

export function createImportPreview(input: {
  schoolBuffer: Buffer;
  schoolName: string;
  programBuffer: Buffer;
  programName: string;
  userId?: string | null;
}) {
  const schoolResult = parseSchoolWorkbook(input.schoolBuffer);
  const programResult = parseProgramWorkbook(input.programBuffer);
  const database = openRawDatabase();
  const schoolRows = database.prepare("SELECT name_zh, raw_json, review_status FROM schools").all() as Array<{
    name_zh: string;
    raw_json: string | null;
    review_status: string;
  }>;
  const programRows = database
    .prepare(
      `SELECT s.name_zh, p.program_type, p.teaching_language, p.raw_json,
              p.manually_verified
       FROM programs p JOIN schools s ON s.id = p.school_id
       WHERE p.archived = 0`,
    )
    .all() as Array<{
    name_zh: string;
    program_type: string;
    teaching_language: string;
    raw_json: string | null;
    manually_verified: number;
  }>;
  database.close();

  const existingSchools = new Map(schoolRows.map((row) => [row.name_zh, row]));
  const existingPrograms = new Map(
    programRows.map((row) => [
      `${row.name_zh}|${row.program_type}|${row.teaching_language}`,
      row,
    ]),
  );
  const summary = {
    schools: emptyCounts(),
    programs: emptyCounts(),
    sourceDuplicates: programResult.duplicates,
    needsReview: 0,
  };
  const entries: PreviewEntry[] = [];

  for (const school of schoolResult.schools) {
    const existing = existingSchools.get(school.nameZh);
    const action = !existing
      ? "NEW"
      : existing.raw_json === school.rawJson
        ? "DUPLICATE"
        : existing.review_status === "VERIFIED"
          ? "CONFLICT"
          : "MODIFIED";
    summary.schools[action] += 1;
    entries.push({ key: school.nameZh, action, details: "学校主数据" });
  }

  for (const program of programResult.programs) {
    const key = `${program.schoolName}|${program.programType}|${program.teachingLanguage}`;
    const existing = existingPrograms.get(key);
    const action = !existing
      ? "NEW"
      : existing.raw_json === program.rawJson
        ? "DUPLICATE"
        : existing.manually_verified
          ? "CONFLICT"
          : "MODIFIED";
    summary.programs[action] += 1;
    summary.needsReview += program.parsed.reviewReasons.length ? 1 : 0;
    entries.push({
      key,
      action,
      details: program.parsed.reviewReasons.join("；") || "可自动结构化",
    });
  }

  const batchId = newId();
  const preview: ImportPreview = {
    batchId,
    sourceNames: [input.schoolName, input.programName],
    schools: schoolResult.schools,
    programs: programResult.programs,
    summary,
    entries,
  };
  const importDir = resolve(/* turbopackIgnore: true */ process.env.IMPORT_DIR ?? "./data/imports");
  mkdirSync(importDir, { recursive: true });
  const previewPath = resolve(importDir, `${batchId}.json`);
  writeFileSync(previewPath, JSON.stringify(preview), "utf8");

  const sourceHash = createHash("sha256")
    .update(schoolResult.sourceHash)
    .update(programResult.sourceHash)
    .digest("hex");
  const db = openRawDatabase();
  db.prepare(
    `INSERT INTO import_batches
     (id, kind, source_name, source_hash, status, summary_json, preview_path,
      imported_by, created_at, updated_at)
     VALUES (?, 'COMBINED', ?, ?, 'PREVIEW', ?, ?, ?, ?, ?)`,
  ).run(
    batchId,
    preview.sourceNames.join(" + "),
    sourceHash,
    JSON.stringify(summary),
    previewPath,
    input.userId ?? null,
    Date.now(),
    Date.now(),
  );
  db.close();
  return preview;
}

function insertMajors(
  database: ReturnType<typeof openRawDatabase>,
  programId: string,
  program: ProgramImportRow,
) {
  database.prepare("DELETE FROM program_majors WHERE program_id = ?").run(programId);
  const insert = database.prepare(
    `INSERT INTO program_majors
     (id, program_id, name, normalized_name, category, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const major of program.parsed.majors) {
    insert.run(
      newId(),
      programId,
      major,
      normalizeKeyword(major),
      findMajorCategory(major, DEFAULT_MAJOR_SYNONYMS),
      Date.now(),
    );
  }
}

function upsertSchool(
  database: ReturnType<typeof openRawDatabase>,
  batchId: string,
  school: SchoolImportRow,
) {
  const existing = database
    .prepare("SELECT id, review_status FROM schools WHERE name_zh = ?")
    .get(school.nameZh) as { id: string; review_status: string } | undefined;
  if (!existing) {
    const id = newId();
    database
      .prepare(
        `INSERT INTO schools
        (id, name_zh, name, category, province, city, website, qs_ranking,
         ranking_info, partnership_rating, csca_status, tags, description,
         cooperation_programs, raw_json, source_batch_id, review_status,
         archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AUTO_PARSED', 0, ?, ?)`,
      )
      .run(
        id,
        school.nameZh,
        school.name,
        school.category,
        school.province,
        school.city,
        school.website,
        school.qsRanking,
        school.rankingInfo,
        school.partnershipRating,
        school.cscaStatus,
        school.tags,
        school.description,
        school.cooperationPrograms,
        school.rawJson,
        batchId,
        Date.now(),
        Date.now(),
      );
    return id;
  }

  if (existing.review_status !== "VERIFIED") {
    database
      .prepare(
        `UPDATE schools SET name = ?, category = ?, province = ?, city = ?,
         website = ?, qs_ranking = ?, ranking_info = ?, partnership_rating = ?,
         csca_status = ?, tags = ?, description = ?, cooperation_programs = ?,
         raw_json = ?, source_batch_id = ?, review_status = 'AUTO_PARSED',
         updated_at = ? WHERE id = ?`,
      )
      .run(
        school.name,
        school.category,
        school.province,
        school.city,
        school.website,
        school.qsRanking,
        school.rankingInfo,
        school.partnershipRating,
        school.cscaStatus,
        school.tags,
        school.description,
        school.cooperationPrograms,
        school.rawJson,
        batchId,
        Date.now(),
        existing.id,
      );
  }
  return existing.id;
}

function upsertProgram(
  database: ReturnType<typeof openRawDatabase>,
  batchId: string,
  schoolId: string,
  program: ProgramImportRow,
) {
  const existing = database
    .prepare(
      `SELECT id, manually_verified FROM programs
       WHERE school_id = ? AND program_type = ? AND teaching_language = ?
       AND archived = 0 LIMIT 1`,
    )
    .get(schoolId, program.programType, program.teachingLanguage) as
    | { id: string; manually_verified: number }
    | undefined;
  const parsed = program.parsed;
  const values = [
    program.name,
    program.tags,
    program.introduction,
    program.duration,
    program.durationNote,
    program.majorText,
    program.directionText,
    program.requirementsText,
    program.semesterText,
    program.applicationTimeText,
    program.scholarshipCategory,
    program.scholarshipContent,
    program.scholarshipNote,
    program.scholarshipDeadlineText,
    program.accommodationText,
    program.insuranceText,
    program.applicationFeeText,
    program.scholarshipApplicationFeeText,
    program.feeNote,
    program.tuitionText,
    parsed.tuition.min,
    parsed.tuition.max,
    parsed.tuition.period,
    parsed.accommodation.min,
    parsed.accommodation.max,
    parsed.insuranceMax,
    parsed.applicationFeeMax,
    parsed.firstYearCostMax,
    parsed.costIncomplete ? 1 : 0,
    parsed.cscaStatus,
    parsed.hskLevelMin,
    parsed.hskScoreMin,
    parsed.ieltsMin,
    parsed.toeflMin,
    parsed.duolingoMin,
    parsed.gpaMin,
    parsed.gpaScale,
    parsed.minAge,
    parsed.maxAge,
    parsed.deadlineDate ? new Date(String(parsed.deadlineDate)).getTime() : null,
    parsed.deadlineStatus,
    JSON.stringify(parsed),
    program.rawJson,
    batchId,
    parsed.reviewReasons.length ? "NEEDS_REVIEW" : "AUTO_PARSED",
  ];

  if (existing?.manually_verified) return existing.id;
  const programId = existing?.id ?? newId();
  if (existing) {
    database
      .prepare(
        `UPDATE programs SET name=?, tags=?, introduction=?, duration=?,
        duration_note=?, major_text=?, direction_text=?, requirements_text=?,
        semester_text=?, application_time_text=?, scholarship_category=?,
        scholarship_content=?, scholarship_note=?, scholarship_deadline_text=?,
        accommodation_text=?, insurance_text=?, application_fee_text=?,
        scholarship_application_fee_text=?, fee_note=?, tuition_text=?,
        tuition_min=?, tuition_max=?, tuition_period=?, accommodation_min=?,
        accommodation_max=?, insurance_max=?, application_fee_max=?,
        first_year_cost_max=?, cost_incomplete=?, csca_status=?, hsk_level_min=?,
        hsk_score_min=?, ielts_min=?, toefl_min=?, duolingo_min=?, gpa_min=?,
        gpa_scale=?, min_age=?, max_age=?, deadline_date=?, deadline_status=?,
        parsed_json=?, raw_json=?, source_batch_id=?, review_status=?,
        updated_at=? WHERE id=?`,
      )
      .run(...values, Date.now(), programId);
  } else {
    database
      .prepare(
        `INSERT INTO programs
        (id, school_id, program_type, teaching_language, name, tags, introduction,
        duration, duration_note, major_text, direction_text, requirements_text,
        semester_text, application_time_text, scholarship_category,
        scholarship_content, scholarship_note, scholarship_deadline_text,
        accommodation_text, insurance_text, application_fee_text,
        scholarship_application_fee_text, fee_note, tuition_text, tuition_min,
        tuition_max, tuition_period, accommodation_min, accommodation_max,
        insurance_max, application_fee_max, first_year_cost_max, cost_incomplete,
        csca_status, hsk_level_min, hsk_score_min, ielts_min, toefl_min,
        duolingo_min, gpa_min, gpa_scale, min_age, max_age, deadline_date,
        deadline_status, parsed_json, raw_json, source_batch_id, review_status,
        manually_verified, archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, ${Array(values.length).fill("?").join(", ")},
        0, 0, ?, ?)`,
      )
      .run(
        programId,
        schoolId,
        program.programType,
        program.teachingLanguage,
        ...values,
        Date.now(),
        Date.now(),
      );
  }
  insertMajors(database, programId, program);
  return programId;
}

export function confirmImport(batchId: string, userId?: string | null) {
  const database = openRawDatabase();
  const batch = database
    .prepare("SELECT preview_path, status FROM import_batches WHERE id = ?")
    .get(batchId) as { preview_path: string; status: string } | undefined;
  if (!batch || batch.status !== "PREVIEW") {
    database.close();
    throw new Error("导入预览不存在或已确认");
  }
  const preview = JSON.parse(readFileSync(/* turbopackIgnore: true */ batch.preview_path, "utf8")) as ImportPreview;
  const schoolIds = new Map<string, string>();
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const school of preview.schools) {
      schoolIds.set(school.nameZh, upsertSchool(database, batchId, school));
    }
    for (const program of preview.programs) {
      const schoolId = schoolIds.get(program.schoolName);
      if (!schoolId) throw new Error(`项目找不到学校：${program.schoolName}`);
      upsertProgram(database, batchId, schoolId, program);
    }
    const synonymInsert = database.prepare(
      `INSERT OR IGNORE INTO major_synonyms
       (id, category, keyword, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const [category, keywords] of Object.entries(DEFAULT_MAJOR_SYNONYMS)) {
      for (const keyword of keywords) {
        synonymInsert.run(newId(), category, keyword, userId ?? null, Date.now(), Date.now());
      }
    }
    database
      .prepare(
        `UPDATE import_batches SET status='CONFIRMED', confirmed_at=?,
         updated_at=? WHERE id=?`,
      )
      .run(Date.now(), Date.now(), batchId);
    database
      .prepare(
        `INSERT INTO audit_logs
         (id, user_id, action, entity_type, entity_id, details_json, created_at)
         VALUES (?, ?, 'IMPORT_CONFIRMED', 'IMPORT_BATCH', ?, ?, ?)`,
      )
      .run(newId(), userId ?? null, batchId, JSON.stringify(preview.summary), Date.now());
    database.exec("COMMIT");
    unlinkSync(/* turbopackIgnore: true */ batch.preview_path);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
  return preview.summary;
}
