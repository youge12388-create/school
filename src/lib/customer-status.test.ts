import { describe, expect, it } from "vitest";

import { deriveAdmissionStatus } from "@/lib/customer-status";

describe("deriveAdmissionStatus", () => {
  it("returns no application for an empty application list", () => {
    expect(deriveAdmissionStatus([])).toBe("NO_APPLICATION");
  });

  it("treats active review states as in progress", () => {
    expect(deriveAdmissionStatus(["SUBMITTED", "UNDER_REVIEW"])).toBe("IN_PROGRESS");
  });

  it("prioritizes an admission over rejected or active applications", () => {
    expect(deriveAdmissionStatus(["REJECTED", "SUBMITTED", "ADMITTED"])).toBe("ADMITTED");
  });

  it("distinguishes rejected and closed applications", () => {
    expect(deriveAdmissionStatus(["REJECTED"])).toBe("REJECTED");
    expect(deriveAdmissionStatus(["CLOSED"])).toBe("CLOSED");
  });
});
