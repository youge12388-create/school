import { schoolIdentityKey, type EvidencePoint, type ResultCard } from "@/lib/ai-screening";
import type { ScreeningResponse } from "@/lib/ai-screening-events";

const pointPriority: Record<string, number> = {
  "CSCA": 0, "学校 CSCA 要求": 0, "专业": 1, "首年预算": 2, "奖学金": 3,
  "英语": 4, "HSK级别": 4, "HSK分数": 4, "住宿": 5, "入学年份": 6, "入学季": 6,
  "申请截止": 7, "授课语言": 8, "申请学历": 9,
};

export function isCandidate(card: ResultCard) {
  return card.kind === "project" && card.quality !== "insufficient";
}

export function displayProgramName(school: string, program: string) {
  const escaped = school.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return program.replace(new RegExp(`^${escaped}\\s*[·・-]\\s*`), "").replace(/UNKNOWN授课/g, "授课语言待确认").replace(/UNKNOWN/g, "待确认");
}

// Only public evidence and the existence of an internal warning participate in the revision.
export function candidateRevision(card: ResultCard) {
  return JSON.stringify({ id: card.programId, name: card.name, program: card.program, fit: card.fit, quality: card.quality, cooperation: card.cooperation, points: card.points, sources: card.sources, warning: card.warning.length > 0, yellow: card.yellow, image: card.image });
}

export function summarizePoints(points: EvidencePoint[]) {
  const prioritized = [...points].sort((a, b) => (pointPriority[a.label] ?? 6) - (pointPriority[b.label] ?? 6));
  const unique = (items: EvidencePoint[]) => [...new Map(items.map((item) => [item.text, item])).values()];
  const matches = unique(prioritized.filter((item) => item.level === "PASS" && item.label !== "申请截止"));
  const concerns = unique(prioritized.filter((item) => item.level === "NEED"))
    .concat(unique(prioritized.filter((item) => item.level === "PASS" && item.label === "申请截止")))
    .concat(unique(prioritized.filter((item) => item.level === "UNKNOWN")));
  return { matches, concerns, highlights: matches.slice(0, 2), firstConcern: concerns[0] };
}

export function admissionListLabel(source: string) {
  if (!source.includes("春季")) return "招生名单";
  const year = source.match(/(20\d{2})\s*春季/u)?.[1] ?? source.match(/(?:^|\D)(20\d{2})(?=\D|$)/u)?.[1];
  return year ? `${year} 年春季招生名单` : "春季招生名单";
}

export function admissionGroupLabel(source: string, group: "partner" | "other") {
  return group === "partner" ? `${admissionListLabel(source)}中的合作院校` : "院校知识库";
}

export function outcomeSummary(result: ScreeningResponse) {
  const count = (cards: ScreeningResponse["results"]["confirmed"]) => new Set(cards.filter(isCandidate).map((card) => schoolIdentityKey(card.name))).size;
  if (result.otherRequested) return `找到 ${count(result.results.other)} 所其他院校。合作状态待核实。`;
  const confirmed = count(result.results.confirmed);
  if (confirmed) return `找到 ${confirmed} 所合作院校，已知条件符合。`;
  return result.results.pending.length ? "合作名单有候选院校，项目条件需要核实。" : "合作名单中暂未找到符合条件的院校。";
}
