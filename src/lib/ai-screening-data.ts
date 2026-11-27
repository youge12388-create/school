import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { PartnerEntry, SchoolInfo } from "@/lib/ai-screening";
import { loadCurrentWorkbook } from "@/lib/ai-screening-workbook";
import { sqlite } from "@/lib/db";
import { getProgramsForScreening } from "@/lib/queries";

import { isTestPlaceholderSchool } from "@/lib/screening-ranking";

const partnerSchema = z.array(z.object({ name: z.string().min(1), status: z.enum(["confirmed", "not_cooperating", "unknown"]), programIds: z.array(z.string()).optional(), note: z.string().optional() }).strict());

async function loadPartners(): Promise<PartnerEntry[]> {
  const path = process.env.AI_SCREENING_PARTNERS_PATH;
  return path ? partnerSchema.parse(JSON.parse(await readFile(path, "utf8"))) : [];
}

export async function loadScreeningData() {
  const [list, partners, rawPrograms] = await Promise.all([loadCurrentWorkbook(), loadPartners(), getProgramsForScreening()]);
  const programs = rawPrograms.filter((program) => !isTestPlaceholderSchool(program.schoolName));
  const schoolRows = (sqlite.prepare(`SELECT id, name_zh AS name, recruitment_preference_text AS preference, updated_at AS updatedAt,
    cooperation_programs AS cooperationPrograms, cooperation_deadline_text AS cooperationDeadline,
    company_recruitment_quota_text AS companyQuota, school_recruitment_plan_text AS recruitmentPlan,
    language_student_assessment_text AS languageAssessment, degree_student_assessment_text AS degreeAssessment,
    cooperation_note AS cooperationNote, special_case_note AS specialCaseNote FROM schools WHERE archived = 0`).all() as {
      id: string; name: string; preference: string | null; updatedAt: number | null; cooperationPrograms: string | null;
      cooperationDeadline: string | null; companyQuota: string | null; recruitmentPlan: string | null;
      languageAssessment: string | null; degreeAssessment: string | null; cooperationNote: string | null; specialCaseNote: string | null;
    }[]).filter((school) => !isTestPlaceholderSchool(school.name));
  const schools: SchoolInfo[] = schoolRows.map((school) => ({ id: school.id, name: school.name, preference: school.preference, updatedAt: school.updatedAt, internalNotes: [
    { source: "学校合作项目", text: school.cooperationPrograms }, { source: "学校合作截止信息", text: school.cooperationDeadline },
    { source: "公司招生名额", text: school.companyQuota }, { source: "学校招生计划", text: school.recruitmentPlan },
    { source: "语言生考核信息", text: school.languageAssessment }, { source: "学历生考核信息", text: school.degreeAssessment },
    { source: "学校合作备注", text: school.cooperationNote }, { source: "学校特殊情况备注", text: school.specialCaseNote },
  ] }));
  const attentionRows = sqlite.prepare(`SELECT id, TRIM(COALESCE(introduction, '') || char(10) || COALESCE(direction_text, '') || char(10) || COALESCE(scholarship_content, '') || char(10) || COALESCE(scholarship_note, '') || char(10) || COALESCE(fee_note, '')) AS attentionText FROM programs WHERE archived = 0`).all() as { id: string; attentionText: string }[];
  const attentionById = new Map(attentionRows.map((row) => [row.id, row.attentionText]));
  return { list, partners, schools, programs: programs.map((program) => ({ ...program, attentionText: attentionById.get(program.id) ?? null })) };
}
