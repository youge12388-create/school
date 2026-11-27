import { describe, expect, it } from "vitest";
import { regionMatches, searchPartnerSchools } from "./partner-school-engine";

/**
 * Ledger region labels are free text, so a policy written as "中东地区" or
 * "南亚各国" must still block the matching students. Equality-only matching
 * silently let those students through.
 */
describe("合作台账区域限制的模糊匹配", () => {
  it("区域词带“地区/各国”等后缀时仍视为同一区域", () => {
    expect(regionMatches(new Set(["中东"]), "中东地区")).toBe(true);
    expect(regionMatches(new Set(["南亚"]), "南亚各国")).toBe(true);
    expect(regionMatches(new Set(["东南亚", "东欧"]), "东欧地区")).toBe(true);
  });

  it("不同区域与空值不会互相命中", () => {
    expect(regionMatches(new Set(["中东"]), "非洲")).toBe(false);
    expect(regionMatches(new Set(["南亚"]), "")).toBe(false);
    expect(regionMatches(new Set(), "南亚")).toBe(false);
  });

  it("种子台账里的区域限制仍会拦截对应生源（国别或区域任一命中）", () => {
    const bangladesh = searchPartnerSchools({ level: "bachelor", nationality: "孟加拉" }, { privileged: true });
    expect(bangladesh.blockedByPolicy.length).toBeGreaterThan(0);
    expect(bangladesh.blockedByPolicy.some((entry) => entry.reason.includes("孟加拉") || entry.reason.includes("南亚"))).toBe(true);
  });

  it("未被任何限制覆盖的生源不会被误拦截", () => {
    const germany = searchPartnerSchools({ level: "bachelor", nationality: "德国" }, { privileged: true });
    expect(germany.results.length).toBeGreaterThan(0);
  });
});
