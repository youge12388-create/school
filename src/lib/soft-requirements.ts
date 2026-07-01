export type SoftRequirementStatus =
  | "REQUIRED"
  | "PREFERRED"
  | "MENTIONED"
  | "UNKNOWN";

export type SoftRequirement = {
  status: SoftRequirementStatus;
  hasSCI?: boolean;
};

export type ProgramSoftRequirements = {
  paperPatent: SoftRequirement;
  competition: SoftRequirement;
};

const REQUIRED_CUE =
  /(必须|须|应当|应提供|应提交|要求提供|要求提交|需提供|需提交|不得少于|不低于|申请材料.{0,12}(包括|包含))/iu;
const PREFERRED_CUE =
  /(如有|可提供|可提交|建议提供|鼓励提供|优先|加分|有利|择优|参考|其他支撑材料|无法提供|可用.{0,20}替代)/iu;
const POST_ADMISSION_CUE =
  /(奖学金获得者|获奖者|入学后|在校期间|在读期间|上一学年|每学年|每年度|延长学习期间|修业期间)/iu;

const PAPER_PATENT_TERMS = [
  /(学术论文|已发表.{0,12}论文|发表.{0,12}论文|论文目录|论文发表|论文成果)/iu,
  /(SCI|EI)\s*(?:论文)?/iu,
  /(专利证书|发明专利|专利证明|已获专利|申请专利)/iu,
  /(研究成果|科研成果|研究能力)/iu,
];

const COMPETITION_TERMS = [
  /(学科竞赛|专业竞赛|竞赛获奖|竞赛经历|比赛获奖|奥林匹克竞赛|奥赛)/iu,
  /(获奖证书|竞赛证书|奖项证书)/iu,
  /(特长|特别优秀|优秀学生|拔尖|表现突出|突出表现)/iu,
  /(降分|降低.{0,12}成绩|放宽.{0,12}标准|破格|可放宽|可适当降低)/iu,
  /(业余爱好|个人特长)/iu,
];

function hasTerm(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function highestStatus(statuses: SoftRequirementStatus[]): SoftRequirementStatus {
  const PRIORITY: Record<SoftRequirementStatus, number> = {
    UNKNOWN: 0,
    MENTIONED: 1,
    PREFERRED: 2,
    REQUIRED: 3,
  };
  return statuses.reduce<SoftRequirementStatus>(
    (highest, s) => (PRIORITY[s] > PRIORITY[highest] ? s : highest),
    "UNKNOWN",
  );
}

function splitSegments(text: string): string[] {
  return text
    .replace(/\\[rn]/gu, "\n")
    .split(/[。；;\n\r]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function classifySegment(segment: string, inMaterials: boolean): SoftRequirementStatus {
  if (POST_ADMISSION_CUE.test(segment)) return "UNKNOWN";
  if (PREFERRED_CUE.test(segment)) return "PREFERRED";
  if (REQUIRED_CUE.test(segment)) return "REQUIRED";
  if (inMaterials && /^[(（]?\d+[）).、\s]/u.test(segment)) return "REQUIRED";
  return "MENTIONED";
}

function parseSoftRequirement(
  text: string,
  termPatterns: RegExp[],
): SoftRequirement {
  if (!text.trim()) return { status: "UNKNOWN" };

  const allSegments = splitSegments(text);
  const inMaterials = /(申请材料|提交材料|所需材料|材料清单)/u.test(text);

  const matches: { segment: string; context: string }[] = [];
  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i];
    const context = [seg, allSegments[i + 1]].filter(Boolean).join("；");
    if (hasTerm(seg, termPatterns)) {
      matches.push({ segment: seg, context });
    }
  }

  if (!matches.length) return { status: "UNKNOWN" };

  const status = highestStatus(matches.map((m) => classifySegment(m.context, inMaterials)));
  const hasSCI = matches.some((m) => /\bSCI\b|\bEI\b/iu.test(m.segment));

  return { status, ...(hasSCI ? { hasSCI: true } : {}) };
}

export function parseProgramSoftRequirements(
  requirementsText: string | null | undefined,
): ProgramSoftRequirements {
  const text = requirementsText ?? "";
  return {
    paperPatent: parseSoftRequirement(text, PAPER_PATENT_TERMS),
    competition: parseSoftRequirement(text, COMPETITION_TERMS),
  };
}