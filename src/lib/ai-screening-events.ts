import type { ChatCriteria, ResultCard } from "@/lib/ai-screening";
import type { FollowUpAnswer } from "@/lib/ai-screening-follow-up";
import type { Narrative } from "@/lib/ai-screening-narrative";

export type SearchStep = {
  id: "understand" | "cooperation" | "alternatives" | "summary";
  status: "active" | "done" | "warning" | "skipped";
  message: string;
};

export type ScreeningResponse = {
  criteria: ChatCriteria;
  results: { confirmed: ResultCard[]; pending: ResultCard[]; other: ResultCard[]; otherHidden: boolean; excludedSchoolCount?: number };
  source: string;
  partnerConfigured: boolean;
  otherRequested: boolean;
  sensitiveContext: boolean;
  prompt: string;
  conversation?: boolean;
  answer?: FollowUpAnswer;
  narrative?: Narrative;
  focusSchool?: string | null;
  shown?: { programIds: string[]; schoolNames: string[] };
};

export type SearchEvent =
  | { type: "progress"; step: SearchStep }
  | { type: "result"; result: ScreeningResponse }
  | { type: "error"; message: string };
