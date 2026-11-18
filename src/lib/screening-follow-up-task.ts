const CONCERN_PRIORITY = [
  "申请截止",
  "入学季",
  "入学年份",
  "首年预算",
  "费用冲突",
  "专业",
  "英语",
  "HSK级别",
  "HSK分数",
  "GPA",
  "CSCA",
  "学校 CSCA 要求",
  "语言",
  "住宿",
  "合作状态",
] as const;

type StoredEvidence = {
  label?: unknown;
  level?: unknown;
};

export type ScreeningFollowUpItem = {
  schoolName: string;
  programName: string;
  evidenceJson: string;
};

export function screeningConcernLabels(evidenceJson: string) {
  let evidence: StoredEvidence[];
  try {
    const parsed = JSON.parse(evidenceJson);
    evidence = Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
  const labels = new Set(
    evidence
      .filter(
        (item) =>
          typeof item.label === "string" &&
          item.level !== "PASS" &&
          !["来源", "内部注意事项", "原表图片"].includes(item.label),
      )
      .map((item) => item.label as string),
  );
  return [...labels].sort((left, right) => {
    const leftIndex = CONCERN_PRIORITY.indexOf(left as never);
    const rightIndex = CONCERN_PRIORITY.indexOf(right as never);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
  });
}

export function screeningFollowUpContent(input: {
  recommendationId: string;
  title: string;
  items: ScreeningFollowUpItem[];
}) {
  const details = input.items.slice(0, 5).map((item) => {
    const labels = screeningConcernLabels(item.evidenceJson).slice(0, 4);
    return `${item.schoolName}（${item.programName}）的${
      labels.length ? labels.join("、") : "招生批次、最新费用和申请截止"
    }`;
  });
  const body = `AI 选校跟进｜${input.title}：核实${details.join("；")}`;
  const suffix = `。核实前不向客户确认费用、截止日期或开班状态。方案编号：${input.recommendationId}`;
  const available = 600 - suffix.length;
  return (body.length > available ? `${body.slice(0, available - 1)}…` : body) + suffix;
}

export function screeningFollowUpDueAt(
  deadlines: Array<number | null>,
  now = new Date(),
) {
  const soon = deadlines.some(
    (deadline) =>
      deadline != null &&
      Number.isFinite(deadline) &&
      deadline >= now.getTime() &&
      deadline <= now.getTime() + 7 * 86_400_000,
  );
  return now.getTime() + (soon ? 1 : 3) * 86_400_000;
}
