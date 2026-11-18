import type { ChatCriteria, ResultCard } from "@/lib/ai-screening";
import type { ScreeningResponse } from "@/lib/ai-screening-events";
import { candidateRevision, displayProgramName, isCandidate } from "@/lib/ai-screening-presentation";

const MAX_PLAN_ITEMS = 30;

export type DraftPlanItem = {
  programId: string;
  name: string;
  program: string;
  fit: string;
  revision: string;
  requiresOtherResults: boolean;
};

export type DraftPlanFields = {
  title: string;
  customerId: string;
  notes: string;
};

export type DraftPlan = DraftPlanFields & {
  criteria: ChatCriteria;
  source: string;
  items: DraftPlanItem[];
};

type PlanOrigin = Pick<ScreeningResponse, "criteria" | "source" | "results">;

function defaultPlanTitle(criteria: ChatCriteria) {
  const degree = criteria.programType && { UG: "本科", MASTER: "硕士", PHD: "博士", LONG_TERM: "长期进修", SHORT_TERM: "短期项目" }[criteria.programType];
  return [criteria.intakeYear ? `${criteria.intakeYear} 年` : null, criteria.targetMajor, degree, "选校方案"]
    .filter(Boolean).join(" ").slice(0, 80);
}

function criteriaKey(criteria: ChatCriteria) {
  return JSON.stringify(Object.entries(criteria)
    .filter(([, value]) => value != null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right)));
}

export function removePlanCandidate(draft: DraftPlan | null, programId: string) {
  return draft ? { ...draft, items: draft.items.filter((item) => item.programId !== programId) } : null;
}

export function togglePlanCandidate(
  draft: DraftPlan | null,
  card: ResultCard,
  origin: PlanOrigin,
  customerId: string,
): { draft: DraftPlan | null; notice: string; error?: boolean } {
  if (!card.programId || !isCandidate(card) || !origin.source) {
    return { draft, notice: "这个项目的资料不足，不能加入方案。", error: true };
  }
  if (draft?.items.some((item) => item.programId === card.programId)) {
    return { draft: removePlanCandidate(draft, card.programId), notice: "已从草稿移除项目。" };
  }
  if (draft?.items.length && (draft.source !== origin.source || criteriaKey(draft.criteria) !== criteriaKey(origin.criteria))) {
    return { draft, notice: "这条结果使用不同的条件或名单。请先保存或清空当前草稿。", error: true };
  }
  const items = draft?.items ?? [];
  if (items.length >= MAX_PLAN_ITEMS) {
    return { draft, notice: "每份方案最多 30 个项目。", error: true };
  }
  return {
    draft: {
      title: draft?.title || defaultPlanTitle(origin.criteria),
      customerId: draft?.customerId || customerId,
      notes: draft?.notes ?? "",
      criteria: origin.criteria,
      source: origin.source,
      items: [...items, {
        programId: card.programId, name: card.name, program: displayProgramName(card.name, card.program),
        fit: card.fit, revision: candidateRevision(card),
        requiresOtherResults: origin.results.other.some((candidate) => candidate.programId === card.programId),
      }],
    },
    notice: "已加入方案草稿。",
  };
}
