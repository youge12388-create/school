import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { migrateDatabase } from "@/lib/db/migration";

const previousDatabasePath = process.env.DATABASE_PATH;

let testDir: string;
let databaseFile: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "school-syt-queries-"));
  databaseFile = join(testDir, "test.db");
  process.env.DATABASE_PATH = databaseFile;
  migrateDatabase(databaseFile);
  vi.resetModules();
});

afterEach(async () => {
  const [{ sqlite }] = await Promise.all([import("@/lib/db")]);
  try {
    sqlite.close();
  } catch {
    // 连接可能已关闭，忽略
  }
  if (previousDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = previousDatabasePath;
  }
  rmSync(testDir, { recursive: true, force: true });
});

function insertSchool(
  databaseFile: string,
  id: string,
  notes: {
    infoNote?: string | null;
    groupApplicationAccount?: string | null;
    scholarshipDisbursementText?: string | null;
    collectionServiceText?: string | null;
    cooperationDeadlineText?: string | null;
    companyRecruitmentQuotaText?: string | null;
    schoolRecruitmentPlanText?: string | null;
    languageStudentAssessmentText?: string | null;
    degreeStudentAssessmentText?: string | null;
    cooperationNote?: string | null;
    specialCaseNote?: string | null;
    recruitmentPreferenceText?: string | null;
    applicationUpdateFrequency?: string | null;
  },
) {
  const database = new DatabaseSync(databaseFile);
  database
    .prepare(`
      INSERT INTO schools (
        id, name_zh, name, info_note, group_application_account,
        scholarship_disbursement_text, collection_service_text,
        cooperation_deadline_text, company_recruitment_quota_text,
        school_recruitment_plan_text, recruitment_preference_text,
        language_student_assessment_text, degree_student_assessment_text,
        cooperation_note, special_case_note, application_update_frequency,
        archived
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `)
    .run(
      id,
      id,
      id,
      notes.infoNote ?? null,
      notes.groupApplicationAccount ?? null,
      notes.scholarshipDisbursementText ?? null,
      notes.collectionServiceText ?? null,
      notes.cooperationDeadlineText ?? null,
      notes.companyRecruitmentQuotaText ?? null,
      notes.schoolRecruitmentPlanText ?? null,
      notes.recruitmentPreferenceText ?? null,
      notes.languageStudentAssessmentText ?? null,
      notes.degreeStudentAssessmentText ?? null,
      notes.cooperationNote ?? null,
      notes.specialCaseNote ?? null,
      notes.applicationUpdateFrequency ?? null,
    );
  database.close();
}

describe("listNotedSchools", () => {
  it("returns only schools with any school-level note", async () => {
    insertSchool(databaseFile, "a", { infoNote: "有信息备注" });
    insertSchool(databaseFile, "b", { cooperationNote: "有合作备注" });
    insertSchool(databaseFile, "c", { specialCaseNote: "有特殊情况备注" });
    insertSchool(databaseFile, "f", { recruitmentPreferenceText: "有招生偏向" });
    insertSchool(databaseFile, "g", { groupApplicationAccount: "有团体申请账号" });
    insertSchool(databaseFile, "d", {});
    insertSchool(databaseFile, "e", { infoNote: "  " });

    const { listNotedSchools } = await import("@/lib/queries");
    const result = await listNotedSchools(1, 20, true);

    const ids = result.rows.map((row) => row.id).sort();
    expect(ids).toEqual(["a", "b", "c", "f", "g"]);
    expect(result.total).toBe(5);
  });

  it("returns note fields for display", async () => {
    insertSchool(databaseFile, "x", { infoNote: "普通备注" });
    insertSchool(databaseFile, "y", { cooperationNote: "机密备注" });

    const { listNotedSchools } = await import("@/lib/queries");
    const result = await listNotedSchools(1, 20, true);
    const row = result.rows.find((row) => row.id === "x");

    expect(row?.infoNote).toBe("普通备注");
    expect(row?.cooperationNote).toBeNull();
    expect(result.rows.find((row) => row.id === "y")?.cooperationNote).toBe(
      "机密备注",
    );
    insertSchool(databaseFile, "z", { recruitmentPreferenceText: "偏好备注" });
    const adminResult = await listNotedSchools(1, 20, true);
    expect(adminResult.rows.find((row) => row.id === "z")?.recruitmentPreferenceText).toBe(
      "偏好备注",
    );
    expect(adminResult.rows.find((row) => row.id === "z")?.groupApplicationAccount).toBeNull();
  });

  it("does not include confidential-only notes when confidential access is disabled", async () => {
    insertSchool(databaseFile, "public", { infoNote: "普通备注" });
    insertSchool(databaseFile, "secret", { recruitmentPreferenceText: "偏好备注" });

    const { listNotedSchools } = await import("@/lib/queries");
    const result = await listNotedSchools(1, 20, false);

    expect(result.rows.map((row) => row.id)).toEqual(["public"]);
    expect(result.rows[0]?.recruitmentPreferenceText).toBeNull();
  });

  it("treats every cooperation and recruitment field as a confidential note", async () => {
    const cases: Array<{
      id: string;
      notes: Parameters<typeof insertSchool>[2];
    }> = [
      { id: "group", notes: { groupApplicationAccount: "有团体申请账号" } },
      { id: "scholarship", notes: { scholarshipDisbursementText: "有奖学金说明" } },
      { id: "collection", notes: { collectionServiceText: "有代收说明" } },
      { id: "deadline", notes: { cooperationDeadlineText: "有合作截止日期" } },
      { id: "quota", notes: { companyRecruitmentQuotaText: "有公司招生名额" } },
      { id: "plan", notes: { schoolRecruitmentPlanText: "有学校招生计划" } },
      { id: "preference", notes: { recruitmentPreferenceText: "有招生偏向" } },
      { id: "language", notes: { languageStudentAssessmentText: "有语言生考核" } },
      { id: "degree", notes: { degreeStudentAssessmentText: "有学历生考核" } },
      { id: "cooperation", notes: { cooperationNote: "有合作备注" } },
      { id: "special", notes: { specialCaseNote: "有特殊情况备注" } },
      { id: "frequency", notes: { applicationUpdateFrequency: "有申请更新频率" } },
    ];

    for (const item of cases) {
      insertSchool(databaseFile, item.id, item.notes);
    }

    const { listNotedSchools } = await import("@/lib/queries");
    const result = await listNotedSchools(1, 20, true);

    expect(result.total).toBe(cases.length);
    expect(result.rows.map((row) => row.id).sort()).toEqual(
      cases.map((item) => item.id).sort(),
    );
  });
});
