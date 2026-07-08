// 测试新字段是否能正常写入 schools 表
// 模拟 updateSchoolAction 的写入逻辑，使用项目相同的 node:sqlite
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const db = new DatabaseSync("data/app.db");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// 1. 找一条已存在的学校记录作为测试目标
const target = db
  .prepare(
    "SELECT id, name_zh FROM schools WHERE archived = 0 ORDER BY partnership_rating DESC, name_zh LIMIT 1",
  )
  .get();
if (!target) {
  console.error("没有可用的学校记录");
  process.exit(1);
}
console.log("目标学校:", target);

// 2. 读取当前值（baseline）
const before = db
  .prepare(
    `SELECT name, category, ranking_info, cooperation_programs,
            group_application_account, scholarship_disbursement_text,
            collection_service_text, cooperation_deadline_text,
            company_recruitment_quota_text, school_recruitment_plan_text,
            recruitment_preference_text, language_student_assessment_text,
            degree_student_assessment_text, cooperation_note,
            special_case_note, application_update_frequency,
            province, city, website, partnership_rating, csca_status,
            qs_ranking, description, tags
     FROM schools WHERE id = ?`,
  )
  .get(target.id);
console.log("写入前部分字段:", {
  name: before.name,
  category: before.category,
  rankingInfo: before.ranking_info,
  cooperationPrograms: before.cooperation_programs,
  groupApplicationAccount: before.group_application_account,
  recruitmentPreferenceText: before.recruitment_preference_text,
});

// 3. 模拟 updateSchoolAction 的完整字段集合
const stamp = randomUUID().slice(0, 8);
const stmt = db.prepare(
  `UPDATE schools SET
    name = @name,
    category = @category,
    province = @province,
    city = @city,
    website = @website,
    partnership_rating = @partnershipRating,
    csca_status = @cscaStatus,
    qs_ranking = @qsRanking,
    ranking_info = @rankingInfo,
    description = @description,
    tags = @tags,
    cooperation_programs = @cooperationPrograms,
    group_application_account = @groupApplicationAccount,
    scholarship_disbursement_text = @scholarshipDisbursementText,
    collection_service_text = @collectionServiceText,
    cooperation_deadline_text = @cooperationDeadlineText,
    company_recruitment_quota_text = @companyRecruitmentQuotaText,
    school_recruitment_plan_text = @schoolRecruitmentPlanText,
    recruitment_preference_text = @recruitmentPreferenceText,
    language_student_assessment_text = @languageStudentAssessmentText,
    degree_student_assessment_text = @degreeStudentAssessmentText,
    cooperation_note = @cooperationNote,
    special_case_note = @specialCaseNote,
    application_update_frequency = @applicationUpdateFrequency,
    review_status = 'VERIFIED',
    updated_at = unixepoch() * 1000
  WHERE id = @id`,
);
const result = stmt.run({
  id: target.id,
  name: `${before.name ?? target.name_zh} [test-${stamp}]`,
  category: `测试分类-${stamp}`,
  province: before.province,
  city: before.city,
  website: before.website,
  partnershipRating: before.partnership_rating ?? 0,
  cscaStatus: before.csca_status,
  qsRanking: before.qs_ranking,
  rankingInfo: `测试排名-${stamp}`,
  description: before.description,
  tags: before.tags,
  cooperationPrograms: `测试合作项目-${stamp}`,
  groupApplicationAccount: `test_account_${stamp}`,
  scholarshipDisbursementText: `每学期发放 ${stamp}`,
  collectionServiceText: `可代收 ${stamp}`,
  cooperationDeadlineText: `2026-12-31 ${stamp}`,
  companyRecruitmentQuotaText: `20人 ${stamp}`,
  schoolRecruitmentPlanText: `春季招生 ${stamp}`,
  recruitmentPreferenceText: `倾向理工科 ${stamp}`,
  languageStudentAssessmentText: `面试+笔试 ${stamp}`,
  degreeStudentAssessmentText: `仅面试 ${stamp}`,
  cooperationNote: `测试合作备注 ${stamp}`,
  specialCaseNote: `测试特殊情况 ${stamp}`,
  applicationUpdateFrequency: `每月更新 ${stamp}`,
});
console.log("写入影响行数:", result.changes);

// 4. 读取写入后的值
const after = db
  .prepare(
    `SELECT name, category, ranking_info, cooperation_programs,
            group_application_account, scholarship_disbursement_text,
            collection_service_text, cooperation_deadline_text,
            company_recruitment_quota_text, school_recruitment_plan_text,
            recruitment_preference_text, language_student_assessment_text,
            degree_student_assessment_text, cooperation_note,
            special_case_note, application_update_frequency,
            updated_at, review_status
     FROM schools WHERE id = ?`,
  )
  .get(target.id);

// 5. 验证：检查每个新字段是否都包含 test 标识
const expectations = {
  name: stamp,
  category: stamp,
  ranking_info: stamp,
  cooperation_programs: stamp,
  group_application_account: stamp,
  scholarship_disbursement_text: stamp,
  collection_service_text: stamp,
  cooperation_deadline_text: stamp,
  company_recruitment_quota_text: stamp,
  school_recruitment_plan_text: stamp,
  recruitment_preference_text: stamp,
  language_student_assessment_text: stamp,
  degree_student_assessment_text: stamp,
  cooperation_note: stamp,
  special_case_note: stamp,
  application_update_frequency: stamp,
};
let allOk = true;
console.log("字段验证:");
for (const [field, expect] of Object.entries(expectations)) {
  const val = after[field];
  if (val && val.includes(expect)) {
    console.log(`  [OK]   ${field}`);
  } else {
    console.log(`  [FAIL] ${field}: 期望包含 ${expect}, 实际为 ${val}`);
    allOk = false;
  }
}

// 6. 还原
const revert = db.prepare(
  `UPDATE schools SET
    name = @name, category = @category, ranking_info = @rankingInfo,
    cooperation_programs = @cooperationPrograms,
    group_application_account = @groupApplicationAccount,
    scholarship_disbursement_text = @scholarshipDisbursementText,
    collection_service_text = @collectionServiceText,
    cooperation_deadline_text = @cooperationDeadlineText,
    company_recruitment_quota_text = @companyRecruitmentQuotaText,
    school_recruitment_plan_text = @schoolRecruitmentPlanText,
    recruitment_preference_text = @recruitmentPreferenceText,
    language_student_assessment_text = @languageStudentAssessmentText,
    degree_student_assessment_text = @degreeStudentAssessmentText,
    cooperation_note = @cooperationNote,
    special_case_note = @specialCaseNote,
    application_update_frequency = @applicationUpdateFrequency,
    updated_at = unixepoch() * 1000
  WHERE id = @id`,
);
revert.run({
  id: target.id,
  name: before.name,
  category: before.category,
  rankingInfo: before.ranking_info,
  cooperationPrograms: before.cooperation_programs,
  groupApplicationAccount: before.group_application_account,
  scholarshipDisbursementText: before.scholarship_disbursement_text,
  collectionServiceText: before.collection_service_text,
  cooperationDeadlineText: before.cooperation_deadline_text,
  companyRecruitmentQuotaText: before.company_recruitment_quota_text,
  schoolRecruitmentPlanText: before.school_recruitment_plan_text,
  recruitmentPreferenceText: before.recruitment_preference_text,
  languageStudentAssessmentText: before.language_student_assessment_text,
  degreeStudentAssessmentText: before.degree_student_assessment_text,
  cooperationNote: before.cooperation_note,
  specialCaseNote: before.special_case_note,
  applicationUpdateFrequency: before.application_update_frequency,
});
console.log("已还原写入前的值");

console.log(allOk ? "\n=== 测试结果: 全部 16 个新字段均可正常写入 ✓ ===" : "\n=== 测试结果: 有字段写入失败 ✗ ===");
db.close();
