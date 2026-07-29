import { describe, expect, it } from "vitest";

import {
  parseAgeRequirement,
  parseDeadline,
  parseMoneyRange,
  parseProgram,
  splitMajors,
} from "./program-parser";

describe("program parser", () => {
  it("灏嗗鏈熻垂鐢ㄦ姌绠椾负骞村害涓婇檺", () => {
    expect(parseMoneyRange("2400-8000鍏?瀛︽湡", "tuition")).toEqual({
      min: 2400,
      max: 8000,
      period: "SEMESTER",
      annualMax: 16000,
    });
  });

  it("灏嗘湭鍐欐槑 CSCA 鐨勬湰绉戦」鐩繚鎸佷负 UNKNOWN", () => {
    const result = parseProgram({
      tuitionText: "26000鍏?骞?,
      accommodationText: "600鍏?鏈?,
      insuranceText: "800鍏?骞?,
      applicationFeeText: "400鍏?,
      requirementsText: "楂樹腑姣曚笟锛孒SK4绾?80鍒?,
      applicationTimeText: "2027骞?鏈?1鏃?,
      majorText: "璁＄畻鏈虹瀛n宸ュ晢绠＄悊",
      programType: "UG",
    });
    expect(result.cscaStatus).toBe("UNKNOWN");
    expect(result.firstYearCostMax).toBe(34400);
    expect(result.hskLevelMin).toBe(4);
    expect(result.hskScoreMin).toBe(180);
  });

  it("瑙ｆ瀽鏄庣‘鐨?CSCA 瑕佹眰鍜岃瑷€闂ㄦ", () => {
    const result = parseProgram({
      tuitionText: "30000鍏?骞?,
      accommodationText: "",
      insuranceText: "",
      applicationFeeText: "",
      requirementsText:
        "椤诲弬鍔犳潵鍗庣暀瀛︽湰绉戝叆瀛﹀涓氭按骞虫祴璇曪紙CSCA锛夛紝闆呮€?.0锛屾墭绂?0锛屽閭诲浗100",
      applicationTimeText: "",
      majorText: "",
      programType: "UG",
    });
    expect(result.cscaStatus).toBe("REQUIRED");
    expect(result.ieltsMin).toBe(6);
    expect(result.toeflMin).toBe(80);
    expect(result.duolingoMin).toBe(100);
  });

  it("涓嶄細鎶婂叾浠栨潗鏂欑殑鍚﹀畾鏉′欢璇垽涓?CSCA 涓嶈姹?, () => {
    const result = parseProgram({
      tuitionText: "24000鍏?骞?,
      accommodationText: "16200鍏?骞?,
      insuranceText: "800鍏?骞?,
      applicationFeeText: "400鍏?,
      requirementsText: [
        "闇€瑕佸弬鍔犮€婃潵鍗庣暀瀛︽湰绉戝叆瀛﹀涓氭按骞虫祴璇曘€婥SCA",
        "濡傛灉鍦ㄤ腑瀛﹂樁娈垫帴鍙楄繃涓枃瀛﹀巻鏁欒偛锛屼竴鑸笉闇€瑕佹彁渚汬SK鎴愮哗",
        "鎶ュ悕鏉愭枡锛欳SCA鑰冭瘯鎴愮哗",
      ].join("\n"),
      applicationTimeText: "2026骞?鏈?0鏃?,
      majorText: "娉曞",
      programType: "UG",
    });

    expect(result.cscaStatus).toBe("REQUIRED");
  });

  it("鍙湪鍚﹀畾璇嶆槑纭寚鍚?CSCA 鏃跺垽瀹氫负涓嶈姹?, () => {
    const result = parseProgram({
      tuitionText: "24000鍏?骞?,
      accommodationText: "",
      insuranceText: "",
      applicationFeeText: "",
      requirementsText: "CSCA鎴愮哗鍙厤鎻愪氦",
      applicationTimeText: "",
      majorText: "娉曞",
      programType: "UG",
    });

    expect(result.cscaStatus).toBe("NOT_REQUIRED");
  });

  it("鍖哄垎鏈€浣庡勾榫勩€佹渶楂樺勾榫勫拰骞撮緞鑼冨洿", () => {
    expect(parseAgeRequirement("鐢宠浜哄勾榫勪笉瓒呰繃 35 宀?)).toEqual({
      minAge: null,
      maxAge: 35,
    });
    expect(parseAgeRequirement("鐢宠浜哄繀椤绘弧 18 宀?)).toEqual({
      minAge: 18,
      maxAge: null,
    });
    expect(parseAgeRequirement("骞撮緞瑕佹眰涓?18-25 宀?)).toEqual({
      minAge: 18,
      maxAge: 25,
    });
    expect(parseAgeRequirement("鐢宠浜哄勾榫勯』鍦?35 宀佷互涓?)).toEqual({
      minAge: null,
      maxAge: 35,
    });
  });

  it("閫夋嫨澶氭壒娆′腑鐨勬渶鏅氭埅姝㈡棩鏈?, () => {
    const result = parseDeadline(
      "绗竴鎵癸細2026骞?鏈?0鏃ワ紱绗簩鎵癸細2026骞?鏈?1鏃?,
      new Date("2026-01-01"),
    );
    expect(result.date?.getMonth()).toBe(4);
    expect(result.date?.getDate()).toBe(31);
  });

  it("鏈堟棩鑼冨洿鍙栫粨鏉熸棩鏈熶负鎴鏃ユ湡锛堟繁鍦冲ぇ瀛︼級", () => {
    const result = parseDeadline(
      "1鏈?鏃?3鏈?0鏃ワ紙绗竴鎵癸級锛?鏈?0鏃?5鏈?1鏃ワ紙绗簩鎵癸級",
      new Date("2026-01-01"),
    );
    expect(result.date?.getMonth()).toBe(4); // 5鏈?    expect(result.date?.getDate()).toBe(31);
    expect(result.status).toBe("OPEN");
  });

  it("璺ㄥ勾鑼冨洿缁撴潫鏃ユ湡鎺ㄥ埌娆″勾锛堟矆闃冲寲宸ュぇ瀛︼級", () => {
    const result = parseDeadline(
      "绉嬪瀛︽湡锛?鏈?5鏃?7鏈?5鏃ワ紱鏄ュ瀛︽湡锛?0鏈?5鏃?1鏈?5鏃?,
      new Date("2026-01-01"),
    );
    expect(result.date?.getFullYear()).toBe(2027);
    expect(result.date?.getMonth()).toBe(0); // 1鏈?    expect(result.date?.getDate()).toBe(15);
    expect(result.status).toBe("OPEN");
  });

  it("鐙珛鏈堟棩鏃ユ湡淇濇寔鍘熸湁閫昏緫", () => {
    const result = parseDeadline(
      "鎴鏃ユ湡锛?鏈?5鏃?,
      new Date("2026-01-01"),
    );
    expect(result.date?.getMonth()).toBe(7); // 8鏈?    expect(result.date?.getDate()).toBe(15);
    expect(result.status).toBe("OPEN");
  });

  it("鎷嗗垎骞跺幓閲嶄笓涓?, () => {
    expect(splitMajors("璁＄畻鏈虹瀛n宸ュ晢绠＄悊\n璁＄畻鏈虹瀛?)).toEqual([
      "璁＄畻鏈虹瀛?,
      "宸ュ晢绠＄悊",
    ]);
  });
});

