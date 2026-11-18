import { z } from "zod";

import { containsPersonalContact, containsSensitiveRestriction } from "@/lib/ai-screening-input";
import { RECOMMENDATION_FIELD_LIMITS } from "@/lib/recommendation-profile";

const limits = RECOMMENDATION_FIELD_LIMITS;
export const planProfileFields = {
  studentName: z.string().trim().min(1).max(limits.studentName),
  studentRegion: z.string().trim().max(limits.region).default(""),
  preferredRegion: z.string().trim().max(limits.region).default(""),
  notes: z.string().trim().max(limits.notes).default(""),
};
export const planTitleField = z.string().trim().min(1).max(limits.title);
export const planIdField = z.string().trim().min(1).max(120);
export const planRequestField = z.string().uuid();

export function profileFormValues(formData: FormData) {
  return {
    studentName: formData.get("studentName"),
    studentRegion: formData.get("studentRegion") ?? undefined,
    preferredRegion: formData.get("preferredRegion") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  };
}

export function hasPrivatePlanText(values: unknown[]) {
  return values.some((value) => typeof value === "string"
    && (containsSensitiveRestriction(value) || containsPersonalContact(value)));
}

export function safePlanEvidence(text: string) {
  return hasPrivatePlanText([text]) ? "涉及内部信息，请人工核实" : text;
}
