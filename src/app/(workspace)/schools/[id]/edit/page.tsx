import Link from "next/link";
import { notFound } from "next/navigation";

import { updateProgramAction, updateSchoolAction } from "@/app/actions";
import { PageHeading } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { requireRole } from "@/lib/auth";
import { getSchoolDetails } from "@/lib/queries";

export default async function SchoolEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "DATA_MANAGER"]);
  const { id } = await params;
  const data = await getSchoolDetails(id);
  if (!data) notFound();
  const { school, programs: schoolPrograms } = data;

  return (
    <>
      <PageHeading
        title={`编辑：${school.nameZh}`}
        description="修改学校基本信息和项目数据，保存后立即生效。"
      />

      <form action={updateSchoolAction} className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3>学校基本信息</h3>
        </div>
        <div className="card-body">
          <input type="hidden" name="id" value={school.id} />
          <div className="form-grid">
            <label>
              学校中文名
              <input name="nameZh" defaultValue={school.nameZh} />
            </label>
            <label>
              学校英文名
              <input name="name" defaultValue={school.name ?? ""} />
            </label>
            <label>
              学校分类
              <input name="category" defaultValue={school.category ?? ""} />
            </label>
            <label>
              省份
              <input name="province" defaultValue={school.province ?? ""} />
            </label>
            <label>
              城市
              <input name="city" defaultValue={school.city ?? ""} />
            </label>
            <label>
              官网
              <input name="website" defaultValue={school.website ?? ""} placeholder="https://" />
            </label>
            <label>
              QS 排名
              <input name="qsRanking" type="number" defaultValue={school.qsRanking ?? ""} />
            </label>
            <label>
              排名信息
              <input name="rankingInfo" defaultValue={school.rankingInfo ?? ""} placeholder="可填写其他排名" />
            </label>
            <label>
              合作星级
              <input name="partnershipRating" type="number" min="0" max="5" defaultValue={school.partnershipRating} />
            </label>
            <label>
              CSCA 状态
              <select name="cscaStatus" defaultValue={school.cscaStatus}>
                <option value="UNKNOWN">未知</option>
                <option value="REQUIRED">要求</option>
                <option value="NOT_REQUIRED">不要求</option>
              </select>
            </label>
            <label>
              标签
              <input name="tags" defaultValue={school.tags ?? ""} />
            </label>
          </div>
          <label style={{ marginTop: 14 }}>
            学校简介
            <textarea name="description" defaultValue={school.description ?? ""} rows={3} />
          </label>
          <label style={{ marginTop: 10 }}>
            合作项目
            <textarea name="cooperationPrograms" defaultValue={school.cooperationPrograms ?? ""} rows={2} placeholder="列出已合作的项目" />
          </label>
          <div className="form-actions">
            <button className="primary" type="submit">保存学校信息</button>
            <Link className="button" href={`/schools/${school.id}`}>取消</Link>
          </div>
        </div>
      </form>

      <form action={updateSchoolAction} className="card" style={{ marginBottom: 24 }}>
        <input type="hidden" name="id" value={school.id} />
        <details className="card-header" style={{ cursor: "pointer" }}>
          <summary style={{ listStyle: "none" }}>
            <h3>合作与招生信息</h3>
            <p className="small muted">仅作为顾问操作参考，不参与学生资格自动判断。点击展开编辑。</p>
          </summary>
        </details>
        <div className="card-body">
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ marginBottom: 8, fontWeight: 600 }}>申请通道</h4>
            <div className="form-grid">
              <label>
                团体申请账号
                <input name="groupApplicationAccount" defaultValue={school.groupApplicationAccount ?? ""} />
              </label>
              <label>
                是否可代收
                <input name="collectionServiceText" defaultValue={school.collectionServiceText ?? ""} />
              </label>
              <label>
                奖学金发放形式
                <input name="scholarshipDisbursementText" defaultValue={school.scholarshipDisbursementText ?? ""} />
              </label>
              <label>
                合作截止日期
                <input name="cooperationDeadlineText" defaultValue={school.cooperationDeadlineText ?? ""} />
              </label>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ marginBottom: 8, fontWeight: 600 }}>招生计划</h4>
            <div className="form-grid">
              <label>
                公司招生名额
                <input name="companyRecruitmentQuotaText" defaultValue={school.companyRecruitmentQuotaText ?? ""} />
              </label>
              <label>
                学校招生计划
                <input name="schoolRecruitmentPlanText" defaultValue={school.schoolRecruitmentPlanText ?? ""} />
              </label>
              <label>
                申请更新频率
                <input name="applicationUpdateFrequency" defaultValue={school.applicationUpdateFrequency ?? ""} />
              </label>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ marginBottom: 8, fontWeight: 600 }}>考核安排</h4>
            <div className="form-grid">
              <label>
                语言生考核
                <input name="languageStudentAssessmentText" defaultValue={school.languageStudentAssessmentText ?? ""} placeholder="语言生面试、笔试安排" />
              </label>
              <label>
                学历生考核
                <input name="degreeStudentAssessmentText" defaultValue={school.degreeStudentAssessmentText ?? ""} placeholder="学历生面试、笔试安排" />
              </label>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ marginBottom: 8, fontWeight: 600 }}>合作说明</h4>
            <label style={{ marginBottom: 10 }}>
              招生偏向
              <textarea name="recruitmentPreferenceText" defaultValue={school.recruitmentPreferenceText ?? ""} rows={2} />
            </label>
            <label style={{ marginBottom: 10 }}>
              合作备注
              <textarea name="cooperationNote" defaultValue={school.cooperationNote ?? ""} rows={2} />
            </label>
            <label>
              特殊情况备注
              <textarea name="specialCaseNote" defaultValue={school.specialCaseNote ?? ""} rows={2} />
            </label>
          </div>
          <div className="form-actions">
            <button className="primary" type="submit">保存合作与招生信息</button>
          </div>
        </div>
      </form>

      <div className="card">
        <div className="card-header">
          <h3>项目信息（{schoolPrograms.length} 个）</h3>
        </div>
        <div className="card-body">
          {schoolPrograms.length === 0 ? (
            <p className="small muted">该校暂无项目数据。</p>
          ) : (
            schoolPrograms.map((program, index) => (
              <form
                action={updateProgramAction}
                key={program.id}
                style={{
                  borderTop: index > 0 ? "1px solid #edf0f2" : "none",
                  paddingTop: index > 0 ? 16 : 0,
                  marginBottom: 16,
                }}
              >
                <input type="hidden" name="id" value={program.id} />
                <h4 style={{ marginBottom: 12, fontWeight: 600 }}>
                  {program.name}
                </h4>
                <div className="form-grid">
                  <label>
                    项目名称
                    <input name="name" defaultValue={program.name} />
                  </label>
                  <label>
                    申请学历
                    <select name="programType" defaultValue={program.programType}>
                      {Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => (
                        <option value={value} key={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    授课语言
                    <select name="teachingLanguage" defaultValue={program.teachingLanguage}>
                      {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                        <option value={value} key={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    学制
                    <input name="duration" defaultValue={program.duration ?? ""} />
                  </label>
                  <label>
                    学费说明
                    <input name="tuitionText" defaultValue={program.tuitionText ?? ""} />
                  </label>
                  <label>
                    首年费用上限（元）
                    <input name="firstYearCostMax" type="number" defaultValue={program.firstYearCostMax ?? ""} />
                  </label>
                  <label>
                    截止日期
                    <input
                      name="deadlineDate"
                      type="date"
                      defaultValue={
                        program.deadlineDate && !isNaN(new Date(program.deadlineDate).getTime())
                          ? new Date(program.deadlineDate).toISOString().slice(0, 10)
                          : ""
                      }
                    />
                  </label>
                  <label>
                    申请时间说明
                    <input name="applicationTimeText" defaultValue={program.applicationTimeText ?? ""} />
                  </label>
                </div>
                <label style={{ marginTop: 10 }}>
                  专业列表
                  <textarea name="majorText" defaultValue={program.majorText ?? ""} rows={3} />
                </label>
                <label style={{ marginTop: 10 }}>
                  申请要求及材料
                  <textarea name="requirementsText" defaultValue={program.requirementsText ?? ""} rows={3} />
                </label>
                <label style={{ marginTop: 10 }}>
                  项目介绍
                  <textarea name="introduction" defaultValue={program.introduction ?? ""} rows={2} />
                </label>
                <label style={{ marginTop: 10 }}>
                  奖学金内容
                  <textarea name="scholarshipContent" defaultValue={program.scholarshipContent ?? ""} rows={2} />
                </label>
                <div className="form-actions">
                  <button className="primary" type="submit">保存此项目</button>
                </div>
              </form>
            ))
          )}
        </div>
      </div>
    </>
  );
}