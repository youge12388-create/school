import { describe, expect, it } from "vitest";

import { parseProgramSoftRequirements } from "./soft-requirements";

describe("soft requirement parser", () => {
  it("识别有SCI/EI论文要求为REQUIRED", () => {
    const result = parseProgramSoftRequirements(
      "申请材料：\\n10. 已发表的 SCI/EI 学术论文。",
    );
    expect(result.paperPatent).toEqual({
      status: "REQUIRED",
      hasSCI: true,
    });
  });

  it("识别竞赛获奖为加分项", () => {
    const result = parseProgramSoftRequirements(
      "如有国家级及以上学科竞赛获奖证书，可作为加分材料。",
    );
    expect(result.competition).toEqual({
      status: "PREFERRED",
    });
  });

  it("不把入学后奖学金志愿服务当作竞赛要求", () => {
    const result = parseProgramSoftRequirements(
      "学校拥有国家级来华留学质量认证资质，可申请校级奖学金。奖学金获得者每年度需为学校提供服务。",
    );
    expect(result.competition).toEqual({ status: "UNKNOWN" });
  });

  it("识别专利要求", () => {
    const result = parseProgramSoftRequirements(
      "申请材料：已获专利或其他科研成果。",
    );
    expect(result.paperPatent).toEqual({
      status: "REQUIRED",
    });
  });

  it("识别放宽条件的学校", () => {
    const result = parseProgramSoftRequirements(
      "成绩单（平均分 80 及以上；艺术特长生可适当放宽标准，需提供相关证书证明）",
    );
    expect(result.competition).toEqual({
      status: "MENTIONED",
    });
  });

  it("识别特别优秀可放宽年龄", () => {
    const result = parseProgramSoftRequirements(
      "申请硕士项目的年龄一般应30岁（含）以下。特别优秀的年龄可适当放宽。",
    );
    expect(result.competition).toEqual({
      status: "PREFERRED",
    });
  });

  it("没有涉及软性条件时返回UNKNOWN", () => {
    const result = parseProgramSoftRequirements(
      "申请要求：高中毕业，持有效外国护照，身心健康。",
    );
    expect(result.paperPatent).toEqual({ status: "UNKNOWN" });
    expect(result.competition).toEqual({ status: "UNKNOWN" });
  });
});