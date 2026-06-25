import type { AdmissionStatus } from "@/lib/constants";

const ACTIVE_APPLICATION_STATUSES = new Set([
  "MATERIAL_PREPARATION",
  "SUBMITTED",
  "UNDER_REVIEW",
  "SUPPLEMENT_REQUIRED",
]);

export function deriveAdmissionStatus(statuses: string[]): AdmissionStatus {
  if (statuses.some((status) => ["ADMITTED", "VISA_PROCESSING", "ENROLLED"].includes(status))) {
    return "ADMITTED";
  }
  if (statuses.some((status) => ACTIVE_APPLICATION_STATUSES.has(status))) {
    return "IN_PROGRESS";
  }
  if (statuses.includes("REJECTED")) return "REJECTED";
  if (statuses.includes("CLOSED")) return "CLOSED";
  return "NO_APPLICATION";
}
