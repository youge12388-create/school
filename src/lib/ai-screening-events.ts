import type { AdmissionDiagnostic } from "@/lib/admission-rule-engine";
import type { ChatCriteria, ResultCard } from "@/lib/ai-screening";
import type { ExternalScreeningResult } from "@/lib/ai-screening-external";
import type { FollowUpAnswer } from "@/lib/ai-screening-follow-up";
import type { Narrative } from "@/lib/ai-screening-narrative";
import type { PartnerSearchPayload } from "@/lib/partner-school-engine";
import type { ScreeningRunMode } from "@/lib/v31-report-builder";
import type { V31GateReport, V31ReportPayload } from "@/lib/v31-report-render";

export type { ScreeningRunMode };

export type SearchStepId = "understand" | "cooperation" | "alternatives" | "external" | "verify" | "summary";

export type SearchStepItem = {
  label: string;
  status: "running" | "done" | "warn" | "skipped";
  url?: string;
  note?: string;
};

export type SearchStepMetrics = {
  partners?: number;
  localKb?: number;
  factDb?: number;
  webPrograms?: number;
  verifiedSites?: number;
  persistedFacts?: number;
};

export type SearchStep = {
  id: SearchStepId;
  status: "active" | "done" | "warning" | "skipped";
  message: string;
  progress?: number;
  detail?: string;
  queries?: string[];
  items?: SearchStepItem[];
  metrics?: SearchStepMetrics;
  timestamp?: number;
};

export type ScreeningResponse = {
  criteria: ChatCriteria;
  runMode?: ScreeningRunMode;
  diagnostic?: AdmissionDiagnostic | null;
  results: { confirmed: ResultCard[]; pending: ResultCard[]; other: ResultCard[]; otherHidden: boolean; excludedSchoolCount?: number; eliminatedNotes?: string[] };
  external?: ExternalScreeningResult | null;
  partnerQuick?: PartnerSearchPayload | null;
  v31Report?: V31ReportPayload | null;
  v31Gates?: V31GateReport | null;
  canExportAdvisorReport?: boolean;
  redactedContact?: boolean;
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
