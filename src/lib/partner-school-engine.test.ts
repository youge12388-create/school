import { describe, expect, it } from "vitest";
import { lookupPartnerMetadata, searchPartnerSchools } from "./partner-school-engine";

describe("内部合作院校检索引擎与权限守门 (v3.1)", () => {
  it("严格执行本专物理隔离并放行授予学士学位的职业本科大学", () => {
    const res = searchPartnerSchools({ level: "bachelor" }, { privileged: true });
    const names = new Set(res.results.map((r) => r.schoolName));
    expect(names.has("温州职业技术学院")).toBe(false);
    expect(names.has("哈尔滨市龙江旅游学校")).toBe(false);
    expect(names.has("深圳职业技术大学")).toBe(true);
    expect(names.has("广州商学院")).toBe(true);
  });

  it("准确拦截禁招国别、偏弱档 985/211，并按合作等级降序排列", () => {
    const res = searchPartnerSchools(
      { level: "bachelor", nationality: "孟加拉", gpaBand: "偏弱" },
      { privileged: true },
    );
    const blockedPolicy = new Set(res.blockedByPolicy.map((b) => b.school));
    const blockedGpa = new Set(res.blockedByGpaBand.map((b) => b.school));
    expect(blockedPolicy.has("郑州大学")).toBe(true);
    expect(blockedPolicy.has("河南大学")).toBe(true);
    expect(blockedPolicy.has("郑州西亚斯学院")).toBe(true);
    expect(blockedGpa.has("哈尔滨工业大学")).toBe(true);
    expect(blockedGpa.has("同济大学")).toBe(true);
    expect(blockedGpa.has("上海大学")).toBe(true);

    const ranks = res.results.map((r) => r.partnerRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    expect(res.results[0].partnerTier).toBe("B");
  });

  it("非管理员/无机密权限账号自动隐藏对接人及敏感国别原文", () => {
    const res = searchPartnerSchools(
      { level: "bachelor", nationality: "孟加拉", gpaBand: "偏弱" },
      { privileged: false },
    );
    expect(res.redactedForPrivilege).toBe(true);
    expect(res.results.every((r) => r.contactPerson === "")).toBe(true);
    expect(res.results.some((r) => r.partnerBadgeText.includes("Julia") || r.partnerBadgeText.includes("Young"))).toBe(false);
    expect(res.blockedByPolicy.every((b) => !b.reason.includes("孟加拉") && !b.reason.includes("非洲"))).toBe(true);

    const julRes = searchPartnerSchools({ contact: "Julia" }, { privileged: false });
    expect(julRes.totalMatched).toBe(0);

    const adminJul = searchPartnerSchools({ contact: "Julia" }, { privileged: true });
    expect(adminJul.totalMatched).toBeGreaterThanOrEqual(10);
  });

  it("lookupPartnerMetadata 精准区分合作校、不合作预警校与全网补充校", () => {
    const meta = lookupPartnerMetadata(["哈尔滨工业大学", "山东大学", "清华大学"], { privileged: true });
    expect(meta["哈尔滨工业大学"].isPartner).toBe(true);
    expect(meta["哈尔滨工业大学"].partnerTier).toBe("B");
    expect(meta["山东大学"].isPartner).toBe(false);
    expect(meta["山东大学"].nonPartnerWarning).toContain("不合作");
    expect(meta["清华大学"].isPartner).toBe(false);
    expect(meta["清华大学"].partnerBadgeText).toBe("全网补充(非合作)");
  });
});
