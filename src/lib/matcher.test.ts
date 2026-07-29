import { describe, expect, it } from "vitest";

import {
  evaluateProgram,
  getEffectiveDeadlineStatus,
  getSupervisorAcceptanceStatus,
  majorMatches,
  matchesSchoolTier,
  parseSchoolTier,
  rankPrograms,
  type MatchProgram,
} from "./matcher";

const now = new Date("2026-06-25T00:00:00+08:00");

const baseProgram: MatchProgram = {
  id: "p1",
  schoolId: "s1",
  schoolName: "娴嬭瘯澶у",
  schoolTags: "985锛?11锛屽弻涓€娴?,
  programName: "娴嬭瘯澶у 路 鏈 路 鑻辨枃鎺堣",
  programType: "UG",
  teachingLanguage: "ENGLISH",
  majorText: "杞欢宸ョ▼\n浜哄伐鏅鸿兘",
  requirementsText: "鐢宠浜洪』涓洪潪涓浗绫嶏紝闆呮€?6.0锛孏PA 80/100锛屽勾榫勪笉瓒呰繃 30 宀?,
  sourceText: null,
  semesterText: "2027 骞寸瀛ｅ叆瀛?,
  applicationTimeText: "鐢宠鎴鏃ユ湡涓?2027骞?鏈?1鏃?,
  accommodationText: "鏍″唴浣忓 8000 鍏?骞?,
  firstYearCostMax: 40000,
  costIncomplete: false,
  cscaStatus: "REQUIRED",
  gpaMin: 80,
  gpaScale: 100,
  hskLevelMin: null,
  hskScoreMin: null,
  ieltsMin: 6,
  toeflMin: 80,
  duolingoMin: 100,
  minAge: null,
  maxAge: 30,
  deadlineDate: new Date("2027-05-31T23:59:59+08:00"),
  deadlineStatus: "OPEN",
  scholarshipCategory: "鏍￠暱濂栧閲?,
  province: "骞夸笢鐪?,
  city: "娣卞湷甯?,
  partnershipRating: 4,
  qsRanking: 300,
  reviewStatus: "AUTO_PARSED",
};

function makeProgram(overrides: Partial<MatchProgram> = {}): MatchProgram {
  return { ...baseProgram, ...overrides };
}

describe("screening matcher", () => {
  it("瑙ｆ瀽闄㈡牎灞傛鏃跺拷鐣ラ潪娉曞€?, () => {
    expect(parseSchoolTier("985")).toBe("985");
    expect(parseSchoolTier("double_first_class_only")).toBe("double_first_class_only");
    expect(parseSchoolTier("ordinary")).toBeUndefined();
    expect(parseSchoolTier()).toBeUndefined();
  });

  it("鎸夊鏍℃爣绛惧皢985銆?11銆佷粎鍙屼竴娴佸拰鍙岄潪鏅€氶櫌鏍′簰鏂ュ垎绫?, () => {
    const programs = [
      makeProgram({ id: "985", schoolTags: "985锛?11锛屽弻涓€娴? }),
      makeProgram({ id: "211", schoolTags: "211锛屽弻涓€娴? }),
      makeProgram({ id: "double-first-class", schoolTags: "鍙屼竴娴? }),
      makeProgram({ id: "untagged", schoolTags: null }),
    ];

    expect(rankPrograms(programs, { schoolTier: "985" }, now).map((item) => item.program.id))
      .toEqual(["985"]);
    expect(rankPrograms(programs, { schoolTier: "211" }, now).map((item) => item.program.id))
      .toEqual(["211"]);
    expect(rankPrograms(programs, { schoolTier: "double_first_class_only" }, now).map((item) => item.program.id))
      .toEqual(["double-first-class"]);
    expect(rankPrograms(programs, { schoolTier: "double_non" }, now).map((item) => item.program.id))
      .toEqual(["untagged"]);
    expect(rankPrograms(programs, {}, now)).toHaveLength(4);
  });

  it("985鍙尮閰嶇簿纭爣绛撅紝涓嶅彈211鎴?85浼樺娍宸ョ▼鏂囨湰褰卞搷", () => {
    const programs = [
      makeProgram({ id: "985-only", schoolTags: "985", programType: "UG" }),
      makeProgram({ id: "southwestern-finance", schoolTags: "211锛屽弻涓€娴侊紝鏁欒偛閮ㄧ洿灞? }),
      makeProgram({ id: "advantage-project", schoolTags: "211锛屽弻涓€娴侊紝985浼樺娍宸ョ▼" }),
      makeProgram({ id: "ordinary", schoolTags: null, programType: "UG" }),
    ];

    expect(rankPrograms(programs, { schoolTier: "985" }, now).map((item) => item.program.id))
      .toEqual(["985-only"]);
    expect(matchesSchoolTier("985", "211")).toBe(false);
    expect(matchesSchoolTier("211", "985")).toBe(false);
    expect(matchesSchoolTier("211锛屽弻涓€娴侊紝985浼樺娍宸ョ▼", "985")).toBe(false);
  });

  it("閫氳繃涓撲笟鍚屼箟璇嶅尮閰?, () => {
    expect(majorMatches("璁＄畻鏈?, baseProgram.majorText)).toEqual({ matched: true, matchType: "synonym", synonymKeyword: "杞欢" });
  });

  it("鎸夐櫌鏍?CSCA 鐘舵€佺瓫閫夛紝骞跺睍绀洪櫌鏍￠渶瑕佺殑 evidence", () => {
    const results = rankPrograms(
      [
        baseProgram,
        makeProgram({ id: "not-required", cscaStatus: "NOT_REQUIRED" }),
        makeProgram({ id: "unknown", cscaStatus: "UNKNOWN" }),
      ],
      { cscaStatus: "REQUIRED" },
      now,
    );

    expect(results.map((item) => item.program.id)).toEqual(["p1"]);
    expect(results[0].evidence).toContainEqual({
      label: "CSCA",
      level: "PASS",
      detail: "闄㈡牎闇€瑕?,
    });
  });

  it("闄㈡牎涓嶉渶瑕佸拰淇℃伅鏈爣鏄庢椂灞曠ず瀵瑰簲 evidence", () => {
    const notRequired = evaluateProgram(
      makeProgram({ cscaStatus: "NOT_REQUIRED" }),
      { cscaStatus: "NOT_REQUIRED" },
      now,
    );
    const unknown = evaluateProgram(
      makeProgram({ cscaStatus: "UNKNOWN" }),
      { cscaStatus: "UNKNOWN" },
      now,
    );

    expect(notRequired.evidence).toContainEqual({
      label: "CSCA",
      level: "PASS",
      detail: "闄㈡牎涓嶉渶瑕?,
    });
    expect(unknown.evidence).toContainEqual({
      label: "CSCA",
      level: "UNKNOWN",
      detail: "淇℃伅鏈爣鏄?,
    });
  });

  it("涓嶅悓 GPA 璁″垎鍒惰繘鍏ヤ汉宸ュ鏍?, () => {
    const result = evaluateProgram(baseProgram, { gpa: 3.5, gpaScale: 4 }, now);
    expect(result.evidence).toContainEqual({
      label: "GPA",
      level: "UNKNOWN",
      detail: "璁″垎鍒朵笉鍚岋紝闇€瑕佷汉宸ュ鏍?,
    });
  });

  it("瀛﹀巻涓嶇鍚堢殑椤圭洰浠嶄繚鐣欏苟鏄剧ず鍘熷洜", () => {
    const results = rankPrograms(
      [baseProgram, makeProgram({ id: "p2", programType: "MASTER" })],
      { programType: "UG" },
      now,
    );
    expect(results).toHaveLength(2);
    expect(results.find((item) => item.program.id === "p2")?.fitLevel).toBe(
      "NOT_MATCHED",
    );
  });

  it("骞撮緞瓒呰繃椤圭洰涓婇檺鏃舵槑纭笉绗﹀悎", () => {
    const result = evaluateProgram(baseProgram, { age: 35 }, now);
    expect(result.fitLevel).toBe("NOT_MATCHED");
    expect(result.evidence).toContainEqual({
      label: "骞撮緞",
      level: "FAIL",
      detail: "35 宀侊紝瓒呰繃鏈€楂樺勾榫?30 宀?,
    });
  });

  it("绛涢€夋椂淇鍘嗗彶鏁版嵁涓彧鏈夋渶楂樺勾榫勫嵈璇瓨鏈€浣庡勾榫勭殑闂", () => {
    const program = makeProgram({
      requirementsText: "鐢宠浜哄勾榫勪笉瓒呰繃 35 宀併€?,
      minAge: 35,
      maxAge: 35,
    });

    const result = evaluateProgram(program, { age: 24 }, now);

    expect(result.fitLevel).toBe("MATCHED");
    expect(result.evidence).toContainEqual({
      label: "骞撮緞",
      level: "PASS",
      detail: "24 宀侊紝绗﹀悎鏈€楂?35 宀?,
    });
  });
  it("鐪佸競鍚嶇О蹇界暐鐪佸拰甯傚悗缂€", () => {
    const result = evaluateProgram(
      baseProgram,
      { province: "骞夸笢", city: "娣卞湷" },
      now,
    );
    expect(result.evidence).toContainEqual({
      label: "鍦板尯",
      level: "PASS",
      detail: "骞夸笢鐪?路 娣卞湷甯?,
    });
  });

  it("鎴鏃ユ湡鏍规嵁褰撳墠鏃堕棿鍔ㄦ€佸垽鏂?, () => {
    const program = makeProgram({
      deadlineDate: new Date("2025-12-31T23:59:59+08:00"),
      deadlineStatus: "OPEN",
    });
    expect(getEffectiveDeadlineStatus(program, now)).toBe("EXPIRED");
    expect(evaluateProgram(program, {}, now).fitLevel).toBe("NEEDS_ACTION");
  });

  it("鎴鏃ユ湡瓒呭嚭绛涢€夎寖鍥存椂灞曠ず涓嶇鍚堝師鍥?, () => {
    const result = evaluateProgram(
      baseProgram,
      { deadlineFrom: new Date("2027-06-01T00:00:00+08:00") },
      now,
    );
    expect(result.fitLevel).toBe("NOT_MATCHED");
    expect(result.evidence.find((item) => item.label === "鐢宠鎴")?.detail).toContain(
      "鏃╀簬绛涢€夎寖鍥?,
    );
  });

  it("澶栧浗鍥界睄婊¤冻鏄庣‘鐨勯潪涓浗绫嶈姹?, () => {
    const result = evaluateProgram(baseProgram, { nationality: "娉板浗" }, now);
    expect(result.evidence).toContainEqual({
      label: "鍥界睄",
      level: "PASS",
      detail: "椤圭洰瑕佹眰澶栧浗鍏皯锛屽鎴峰浗绫嶇鍚?,
    });
  });

  it("缂哄皯浣忓淇℃伅鏃朵繚鐣欓」鐩苟鏍囪鏈煡", () => {
    const result = evaluateProgram(
      makeProgram({ accommodationText: null }),
      { accommodationRequired: true },
      now,
    );
    expect(result.fitLevel).toBe("UNKNOWN");
    expect(result.evidence).toContainEqual({
      label: "浣忓",
      level: "UNKNOWN",
      detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭?,
    });
  });

  it("鍏ュ骞翠唤鍦ㄩ」鐩枃鏈腑鍑虹幇鏃跺垽瀹氶€氳繃", () => {
    const result = evaluateProgram(baseProgram, { intakeYear: 2027 }, now);
    expect(result.evidence).toContainEqual({
      label: "鍏ュ骞翠唤",
      level: "PASS",
      detail: "椤圭洰鏂囨湰鍖呭惈 2027 骞?,
    });
  });

  it("鎺掑簭鎸夊彲鐩存帴鐢宠銆佹湭鐭ャ€佹槑纭笉绗﹀悎鎺掑垪", () => {
    const matched = makeProgram({ id: "matched", reviewStatus: "VERIFIED" });
    const unknown = makeProgram({
      id: "unknown",
      deadlineDate: null,
      deadlineStatus: "UNKNOWN",
    });
    const failed = makeProgram({ id: "failed", programType: "MASTER" });
    const results = rankPrograms(
      [failed, unknown, matched],
      { programType: "UG" },
      now,
    );
    expect(results.map((item) => item.program.id)).toEqual([
      "matched",
      "unknown",
      "failed",
    ]);
  });

  it("鎴鐘舵€佺瓫閫夊彧淇濈暀鎵€閫夌姸鎬?, () => {
    const expired = makeProgram({
      id: "expired",
      deadlineDate: new Date("2025-01-01T00:00:00+08:00"),
    });
    const results = rankPrograms(
      [baseProgram, expired],
      { deadlineMode: "expired" },
      now,
    );
    expect(results.map((item) => item.program.id)).toEqual(["expired"]);
  });

  it("鏃犳晥鎴鏃ユ湡褰掑叆淇℃伅鏈煡涓斾笉浼氭姏閿?, () => {
    const program = makeProgram({
      deadlineDate: new Date("invalid"),
      deadlineStatus: "OPEN",
    });
    expect(getEffectiveDeadlineStatus(program, now)).toBe("UNKNOWN");
    const result = evaluateProgram(program, {}, now);
    expect(result.fitLevel).toBe("UNKNOWN");
    expect(result.evidence).toContainEqual({
      label: "鐢宠鎴",
      level: "UNKNOWN",
      detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭?,
    });
  });

  it("detects school-required supervisor acceptance letter", () => {
    const program = makeProgram({
      programType: "MASTER",
      requirementsText: "鐢宠鏉愭枡鍖呮嫭瀵煎笀鎺ユ敹鍑姐€佹垚缁╁崟鍜岃瑷€鎴愮哗銆?,
    });
    const result = evaluateProgram(
      program,
      { programType: "MASTER", supervisorAcceptance: "required" },
      now,
    );
    expect(getSupervisorAcceptanceStatus(program)).toBe("REQUIRED");
    expect(result.fitLevel).toBe("MATCHED");
    expect(result.evidence).toContainEqual({
      label: "瀵煎笀鎺ユ敹鍑?,
      level: "PASS",
      detail: "瀛︽牎鐢宠鏉′欢鏄庣‘瑕佹眰瀵煎笀鎺ユ敹鍑?,
    });
  });

  it("detects common supervisor acceptance wording variants", () => {
    const variants = [
      "鍦ㄧ嚎鐢宠绯荤粺涓€夋嫨涓撲笟鏃堕€夋嫨瀵煎笀锛屽苟鍙栧緱瀵煎笀瀹℃牳閫氳繃銆?,
      "鍗氬＋鐢宠浜哄簲鎻愪緵瀵煎笀閭€璇峰嚱绛夊綍鍙栨潗鏂欍€?,
      "鐢宠鏉愭枡鍖呭惈銆婃剰鍚戝甯堟帹鑽愪俊銆嬨€?,
      "Applicants must submit a supervisor invitation letter.",
      "Applicants should provide pre-acceptance approval from an advisor.",
    ];

    for (const requirementsText of variants) {
      const program = makeProgram({ programType: "MASTER", requirementsText });

      expect(getSupervisorAcceptanceStatus(program)).toBe("REQUIRED");
    }
  });

  it("keeps mixed supervisor requirements as partial required", () => {
    const program = makeProgram({
      programType: "MASTER",
      requirementsText:
        "浠ヤ笅闄㈢郴椤诲湪鎶ュ悕鍓嶅彇寰楀甯堟帴鏀舵剰鍚戝嚱锛氳埅绌哄闄紱鍏朵粬瀛﹂櫌纭曞＋椤圭洰鐢宠锛屽甯堟帴鏀跺嚱涓洪潪蹇呴渶鏂囦欢銆?,
    });

    const result = evaluateProgram(
      program,
      { programType: "MASTER", supervisorAcceptance: "required" },
      now,
    );

    expect(getSupervisorAcceptanceStatus(program)).toBe("PARTIAL_REQUIRED");
    expect(result.fitLevel).toBe("NEEDS_ACTION");
    expect(result.evidence).toContainEqual({
      label: "瀵煎笀鎺ユ敹鍑?,
      level: "NEED",
      detail: "閮ㄥ垎瀛﹂櫌鎴栦笓涓氳姹傚甯堟帴鏀跺嚱锛岄渶纭鐩爣涓撲笟",
    });
  });

  it("detects supervisor intention form as required", () => {
    const program = makeProgram({
      programType: "MASTER",
      requirementsText:
        "銆婃禉姹熷伐鍟嗗ぇ瀛﹀甯堟帴鏀跺浗闄呭鐢熸剰鍚戣〃銆嬪師鍒欎笂锛岀澹拰鍗氬＋椤圭洰鐢宠鑰呭簲鍚戝甯堟彁渚涜琛ㄦ牸濉啓骞舵彁浜ゃ€?,
    });

    expect(getSupervisorAcceptanceStatus(program)).toBe("REQUIRED");
  });

  it("detects explicit supervisor acceptance letter exemption", () => {
    const program = makeProgram({
      programType: "MASTER",
      requirementsText: "鏃犻渶鎻愬墠鑱旂郴瀵煎笀锛屼笉闇€瑕佸甯堟帴鏀跺嚱銆?,
    });
    const result = evaluateProgram(
      program,
      { programType: "MASTER", supervisorAcceptance: "not_required" },
      now,
    );
    expect(getSupervisorAcceptanceStatus(program)).toBe("NOT_REQUIRED");
    expect(result.evidence).toContainEqual({
      label: "瀵煎笀鎺ユ敹鍑?,
      level: "PASS",
      detail: "瀛︽牎鐢宠鏉′欢鏄庣‘涓嶈姹傚甯堟帴鏀跺嚱",
    });
  });

  it("鏄庣‘绔炶禌灞傜骇瑕佹眰鏈揪鍒版椂鍒ゅ畾涓嶇鍚?, () => {
    const program = makeProgram({
      requirementsText: "鐢宠浜洪』鎻愪緵鍥藉绾у绉戠珵璧涜幏濂栬瘉涔︺€?,
    });

    const result = evaluateProgram(program, { hasCompetition: "competition" }, now);

    expect(result.fitLevel).toBe("NOT_MATCHED");
    expect(result.evidence).toContainEqual({
      label: "绔炶禌缁忓巻",
      level: "FAIL",
      detail: "椤圭洰瑕佹眰鑷冲皯杈惧埌鍥藉绾х珵璧?,
    });
  });

  it("鍙€夌珵璧涘姞鍒嗛」缂哄け鏃朵笉娣樻卑椤圭洰", () => {
    const program = makeProgram({
      requirementsText: "濡傛湁鍥藉绾у绉戠珵璧涜幏濂栬瘉涔︼紝鍙綔涓哄姞鍒嗘潗鏂欍€?,
    });

    const result = evaluateProgram(program, { hasCompetition: "competition" }, now);

    expect(result.fitLevel).toBe("MATCHED");
    expect(result.evidence.some((item) => item.label === "绔炶禌缁忓巻")).toBe(false);
  });

  it.skip("瀹㈡埛鍏峰瀛︽牎閲嶈鐨勮蒋鎬ф潯浠舵椂鎻愰珮鎺掑簭", () => {
    const relevant = makeProgram({
      id: "sat-relevant",
      requirementsText: "鍙彁浜?SAT/AP/ACT 绛夋爣鍑嗗寲鑰冭瘯鎴愮哗浣滀负琛ュ厖鏉愭枡銆?,
    });
    const unmentioned = makeProgram({
      id: "sat-unmentioned",
      requirementsText: "鐢宠浜洪』涓洪潪涓浗绫嶃€?,
    });

    const results = rankPrograms(
      [unmentioned, relevant],
      { hasPaperPatent: "general" },
      now,
    );

    expect(results.map((item) => item.program.id)).toEqual([
      "sat-relevant",
      "sat-unmentioned",
    ]);
    expect(results[0].evidence).toContainEqual({
      label: "SAT",
      level: "PASS",
      detail: "瀹㈡埛宸插叿澶囷紱椤圭洰灏嗘椤逛綔涓哄彲閫夋垨鍔犲垎鏉愭枡",
    });
  });

  it("鐭ヨ瘑搴撴湭鍐欐槑杞€ф潯浠舵椂涓嶅埗閫犳湭鐭ョ粨璁?, () => {
    const result = evaluateProgram(
      makeProgram({ requirementsText: "鐢宠浜洪』涓洪潪涓浗绫嶃€? }),
      { hasCompetition: "competition" },
      now,
    );

    expect(result.fitLevel).toBe("MATCHED");
    expect(result.evidence.some((item) => item.label === "蹇楁効鑰呯粡鍘?)).toBe(false);
  });
});

