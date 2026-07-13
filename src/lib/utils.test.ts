import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatMoney } from "./utils";

describe("format helpers", () => {
  it("无效日期显示为知识库未知信息", () => {
    expect(formatDate(new Date("invalid"))).toBe("数据库未有相关信息");
  });

  it("零时间戳仍按有效日期显示", () => {
    expect(formatDate(0)).not.toBe("—");
  });

  it("formatDateTime 包含时分", () => {
    const date = new Date("2026-07-13T14:30:00+08:00");
    const result = formatDateTime(date);
    expect(result).toContain("14");
    expect(result).toContain("30");
  });

  it("空值显示为 —", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("非有限金额显示为知识库未知信息", () => {
    expect(formatMoney(Number.NaN)).toBe("数据库未有相关信息");
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe("数据库未有相关信息");
  });
});