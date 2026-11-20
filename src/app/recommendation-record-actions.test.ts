import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MatchProgram } from "@/lib/matcher";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  permissions: vi.fn(),
  programs: vi.fn(),
  save: vi.fn(),
  existing: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/access-control", () => ({ getUserPermissions: mocks.permissions }));
vi.mock("@/lib/queries", () => ({ getProgramsForScreening: mocks.programs }));
vi.mock("@/lib/recommendation-records", () => ({
  existingPlanRequest: mocks.existing,
  hashPlanRequest: vi.fn(() => "request-hash"),
  saveRecommendationRecord: mocks.save,
  updateRecommendationRecord: mocks.update,
  deleteRecommendationRecord: mocks.remove,
}));

import {
  deleteRecommendationRecordAction,
  saveScreeningPlanAction,
  updateRecommendationRecordAction,
} from "./recommendation-record-actions";

const program: MatchProgram = {
  id: "program-1",
  schoolId: "school-1",
  schoolName: "示例大学",
  schoolTags: null,
  programName: "计算机硕士",
  programType: "MASTER",
  teachingLanguage: "ENGLISH",
  majorText: "计算机",
  requirementsText: null,
  sourceText: null,
  semesterText: null,
  applicationTimeText: null,
  accommodationText: null,
  firstYearCostMax: null,
  costIncomplete: true,
  cscaStatus: "UNKNOWN",
  gpaMin: null,
  gpaScale: null,
  hskLevelMin: null,
  hskScoreMin: null,
  ieltsMin: null,
  toeflMin: null,
  duolingoMin: null,
  minAge: null,
  maxAge: null,
  deadlineDate: new Date("2099-01-01T00:00:00Z"),
  deadlineStatus: "OPEN",
  scholarshipCategory: null,
  province: "广东",
  city: "深圳",
  partnershipRating: 0,
  qsRanking: null,
  reviewStatus: "AUTO_PARSED",
};

function formData(criteria: Record<string, unknown>) {
  const data = new FormData();
  data.set("requestId", randomUUID());
  data.set("title", "三校申请方案");
  data.set("studentName", "林同学");
  data.set("studentRegion", "泰国");
  data.set("preferredRegion", "广东 · 深圳");
  data.set("notes", "");
  data.set("criteriaJson", JSON.stringify(criteria));
  data.append("programIds", "program-1");
  data.set("reason_program-1", "");
  return data;
}

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ id: "advisor-1", role: "ADMIN", authProvider: "LOCAL" });
  mocks.permissions.mockReset().mockReturnValue(["SCREENING_VIEW", "RECOMMENDATION_MANAGE"]);
  mocks.programs.mockReset();
  mocks.save.mockReset();
  mocks.existing.mockReset().mockReturnValue("missing");
  mocks.update.mockReset();
  mocks.remove.mockReset();
  mocks.redirect.mockReset();
});

describe("条件筛查方案保存", () => {
  it("无方案管理权限的账号不能绕过界面保存", async () => {
    mocks.permissions.mockReturnValue(["SCREENING_VIEW"]);
    const result = await saveScreeningPlanAction(
      { error: "" },
      formData({ programType: "MASTER", targetMajor: "计算机" }),
    );
    expect(result).toEqual({ error: "当前账号无权保存方案。" });
    expect(mocks.programs).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("服务端拒绝绕过界面保存已截止项目", async () => {
    mocks.programs.mockResolvedValue([{
      ...program,
      deadlineDate: new Date("2000-01-01T00:00:00Z"),
    }]);
    const result = await saveScreeningPlanAction(
      { error: "" },
      formData({ programType: "MASTER", targetMajor: "计算机" }),
    );
    expect(result.error).toContain("已更新");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("服务端拒绝绕过界面保存明确不符合的项目", async () => {
    mocks.programs.mockResolvedValue([{ ...program, majorText: "法学" }]);
    const result = await saveScreeningPlanAction(
      { error: "" },
      formData({ programType: "MASTER", targetMajor: "计算机" }),
    );
    expect(result.error).toContain("已更新");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe("方案记录编辑", () => {
  function profileForm(version = "2") {
    const data = new FormData();
    data.set("version", version);
    data.set("studentName", "林同学");
    data.set("studentRegion", "泰国 · 曼谷");
    data.set("preferredRegion", "江苏 · 南京");
    data.set("notes", "等待语言成绩");
    return data;
  }

  it("使用表单版本号保存，支持同一页面连续编辑", async () => {
    mocks.update.mockReturnValue("updated");
    const result = await updateRecommendationRecordAction(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      { error: "" },
      profileForm("2"),
    );
    expect(result).toEqual({ error: "", saved: true });
    expect(mocks.update).toHaveBeenCalledWith(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      2,
      {
        studentName: "林同学",
        studentRegion: "泰国 · 曼谷",
        preferredRegion: "江苏 · 南京",
        notes: "等待语言成绩",
      },
      "advisor-1",
    );
  });

  it("拒绝缺失或非法版本号", async () => {
    const missing = profileForm();
    missing.delete("version");
    await expect(updateRecommendationRecordAction(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      { error: "" },
      missing,
    )).resolves.toEqual({ error: "无法识别此方案，请刷新后重试。" });
    await expect(updateRecommendationRecordAction(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      { error: "" },
      profileForm("1.5"),
    )).resolves.toEqual({ error: "无法识别此方案，请刷新后重试。" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("无方案管理权限的账号不能直接调用编辑操作", async () => {
    mocks.permissions.mockReturnValue([]);
    await expect(updateRecommendationRecordAction(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      { error: "" },
      profileForm("2"),
    )).resolves.toEqual({ error: "当前账号无权编辑方案记录。" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("方案记录删除", () => {
  function deleteForm(version = "2") {
    const data = new FormData();
    data.set("version", version);
    return data;
  }

  it("删除时使用表单版本号和当前操作人写入审计", async () => {
    mocks.remove.mockReturnValue("deleted");
    await expect(deleteRecommendationRecordAction(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      { error: "" },
      deleteForm("2"),
    )).resolves.toEqual({ error: "", deleted: true });
    expect(mocks.remove).toHaveBeenCalledWith(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      2,
      "advisor-1",
    );
  });

  it("无方案管理权限时拒绝删除", async () => {
    mocks.permissions.mockReturnValue([]);
    await expect(deleteRecommendationRecordAction(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      { error: "" },
      deleteForm(),
    )).resolves.toEqual({ error: "当前账号无权删除方案记录。" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("拒绝非法版本号，并区分过期和不存在方案", async () => {
    await expect(deleteRecommendationRecordAction(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      { error: "" },
      deleteForm("2.5"),
    )).resolves.toEqual({ error: "无法识别此方案，请刷新后重试。" });

    mocks.remove.mockReturnValueOnce("conflict").mockReturnValueOnce("missing");
    await expect(deleteRecommendationRecordAction(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      { error: "" },
      deleteForm(),
    )).resolves.toEqual({ error: "方案已被更新，请刷新后再删除。" });
    await expect(deleteRecommendationRecordAction(
      "2466c108-a7b0-437f-a4ff-d05c7801dba0",
      { error: "" },
      deleteForm(),
    )).resolves.toEqual({ error: "此方案不存在或已删除。" });
  });
});
