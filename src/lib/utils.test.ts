import { describe, expect, it } from "vitest";

import { formatDate, formatMoney } from "./utils";

describe("format helpers", () => {
  it("无效日期显示为知识库未知信息", () => {
    expect(formatDate(new Date("invalid"))).toBe("数据库未有相关信息");
  });

  it("零时间戳仍按有效日期显示", () => {
    expect(formatDate(0)).not.toBe("—");
  });

  it("非有限金额显示为知识库未知信息", () => {
    expect(formatMoney(Number.NaN)).toBe("数据库未有相关信息");
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe("数据库未有相关信息");
  });
});