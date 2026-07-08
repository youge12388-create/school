import { describe, expect, it } from "vitest";

import {
  categorizeMajor,
  categorizeMajors,
  isMajorNoise,
  splitMajorText,
} from "./major-categories";

describe("major categories", () => {
  it("把常见专业正确归类到对应大类", () => {
    expect(categorizeMajor("土木工程")).toBe("engineering");
    expect(categorizeMajor("计算机科学与技术")).toBe("engineering");
    expect(categorizeMajor("软件工程")).toBe("engineering");
    expect(categorizeMajor("人工智能")).toBe("engineering");

    expect(categorizeMajor("临床医学")).toBe("medicine");
    expect(categorizeMajor("中医学")).toBe("medicine");
    expect(categorizeMajor("口腔医学")).toBe("medicine");
    expect(categorizeMajor("药学")).toBe("medicine");
    expect(categorizeMajor("医学影像")).toBe("medicine");
    expect(categorizeMajor("生物医学工程")).toBe("medicine");

    expect(categorizeMajor("国际经济与贸易")).toBe("economics_business");
    expect(categorizeMajor("金融学")).toBe("economics_business");
    expect(categorizeMajor("会计学")).toBe("economics_business");

    expect(categorizeMajor("法学")).toBe("law_politics");
    expect(categorizeMajor("国际关系")).toBe("law_politics");
    expect(categorizeMajor("社会学")).toBe("law_politics");

    expect(categorizeMajor("汉语言文学")).toBe("literature_language");
    expect(categorizeMajor("英语")).toBe("literature_language");
    expect(categorizeMajor("日语笔译")).toBe("literature_language");
    expect(categorizeMajor("新闻与传播")).toBe("literature_language");

    expect(categorizeMajor("学前教育")).toBe("education_psychology");
    expect(categorizeMajor("应用心理学")).toBe("education_psychology");
    expect(categorizeMajor("体育教育")).toBe("education_psychology");

    expect(categorizeMajor("中国史")).toBe("history");
    expect(categorizeMajor("考古学")).toBe("history");

    expect(categorizeMajor("数学")).toBe("science");
    expect(categorizeMajor("物理学")).toBe("science");
    expect(categorizeMajor("统计学")).toBe("science");
    expect(categorizeMajor("生物学")).toBe("science");

    expect(categorizeMajor("农学")).toBe("agriculture");
    expect(categorizeMajor("动物医学")).toBe("agriculture");
    expect(categorizeMajor("园林")).toBe("agriculture");
    expect(categorizeMajor("林学")).toBe("agriculture");

    expect(categorizeMajor("音乐学")).toBe("art");
    expect(categorizeMajor("美术学")).toBe("art");
    expect(categorizeMajor("中国画")).toBe("art");
    expect(categorizeMajor("戏剧影视导演")).toBe("art");

    expect(categorizeMajor("行政管理")).toBe("management");
    expect(categorizeMajor("图书情报")).toBe("management");
    expect(categorizeMajor("物流管理")).toBe("management");

    expect(categorizeMajor("哲学")).toBe("philosophy");
  });

  it("工学优先匹配特异度高的类，避免医学/农学专业被工程吞掉", () => {
    // 这些专业名虽然含"工程"二字，但应归到特异度更高的类
    expect(categorizeMajor("生物医学工程")).toBe("medicine");
    expect(categorizeMajor("森林工程")).toBe("agriculture");
    expect(categorizeMajor("医院管理")).toBe("management");
  });

  it("理学优先于工学，避免水文学被工程类吞掉", () => {
    expect(categorizeMajor("水文学及水资源")).toBe("science");
    expect(categorizeMajor("水文学与水资源")).toBe("science");
    // 但含"工程"的仍归工学
    expect(categorizeMajor("水利工程")).toBe("engineering");
    expect(categorizeMajor("水文与水资源工程")).toBe("engineering");
  });

  it("识别噪音条目并过滤", () => {
    expect(isMajorNoise("HSK4级辅导")).toBe(true);
    expect(isMajorNoise("① 汉语综合")).toBe(true);
    expect(isMajorNoise("(招生人数有限)")).toBe(true);
    expect(isMajorNoise("周一至周五")).toBe(true);
    expect(isMajorNoise("中国文化讲座")).toBe(true);
    expect(isMajorNoise("运动会")).toBe(true);
    expect(isMajorNoise("注：1课时等于45分钟")).toBe(true);
    expect(isMajorNoise("选修课：HSK3级辅导")).toBe(true);
    expect(isMajorNoise("未达到开班条件的报名学生可更换专业")).toBe(true);
    expect(isMajorNoise("")).toBe(true);
    expect(isMajorNoise("X".repeat(50))).toBe(true);

    // 真专业不应被误判为噪音
    expect(isMajorNoise("土木工程")).toBe(false);
    expect(isMajorNoise("国际经济与贸易")).toBe(false);
    expect(isMajorNoise("计算机科学与技术")).toBe(false);
  });

  it("splitMajorText 按换行/分号/逗号切分", () => {
    expect(splitMajorText("土木工程\n机械工程\n电气工程")).toEqual([
      "土木工程",
      "机械工程",
      "电气工程",
    ]);
    expect(splitMajorText("金融学；会计学，工商管理")).toEqual([
      "金融学",
      "会计学",
      "工商管理",
    ]);
    expect(splitMajorText(null)).toEqual([]);
    expect(splitMajorText("")).toEqual([]);
  });

  it("categorizeMajors 清洗+分组+去重", () => {
    const input = [
      "土木工程",
      "土木工程", // 重复
      "临床医学",
      "HSK4级辅导", // 噪音
      "金融学",
      "汉语言文学",
      "钢琴",
      "钢琴", // 重复
      "某个无法归类的专业",
    ];
    const result = categorizeMajors(input);
    const labels = result.categories.map((c) => c.label);
    expect(labels).toContain("工学");
    expect(labels).toContain("医学");
    expect(labels).toContain("经济·商科");
    expect(labels).toContain("文学·语言");
    expect(labels).toContain("艺术学");

    // 工学里有"土木工程"且不重复
    const engineering = result.categories.find((c) => c.label === "工学");
    expect(engineering?.majors).toEqual(["土木工程"]);

    // 艺术学里有"钢琴"且不重复
    const art = result.categories.find((c) => c.label === "艺术学");
    expect(art?.majors).toEqual(["钢琴"]);

    // 未归类的进入 others
    expect(result.others).toEqual(["某个无法归类的专业"]);

    // 噪音被过滤
    const allMajors = [
      ...result.categories.flatMap((c) => c.majors),
      ...result.others,
    ];
    expect(allMajors).not.toContain("HSK4级辅导");
  });

  it("categorizeMajors 各大类按拼音排序", () => {
    const result = categorizeMajors(["数学", "物理学", "化学", "生物学"]);
    const science = result.categories.find((c) => c.label === "理学");
    // 拼音序：化学(huaxue)、数学(shuxue)、物理学(wulixue)、生物学(shengwuxue)
    // 实际 localeCompare zh-CN 排序
    expect(science?.majors).toEqual(
      ["数学", "物理学", "化学", "生物学"].sort((a, b) =>
        a.localeCompare(b, "zh-CN"),
      ),
    );
  });

  it("categorizeMajors 空分组不出现在结果里", () => {
    const result = categorizeMajors(["土木工程", "机械工程"]);
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].label).toBe("工学");
    expect(result.others).toEqual([]);
  });
});
