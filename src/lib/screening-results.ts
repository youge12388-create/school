import type { FitLevel, RankedProgram } from "@/lib/matcher";

type CurrentFitLevel = Exclude<FitLevel, "NOT_MATCHED">;

export function partitionScreeningResults(results: RankedProgram[]) {
  const currentByFit: Record<CurrentFitLevel, RankedProgram[]> = {
    MATCHED: [],
    NEEDS_ACTION: [],
    UNKNOWN: [],
  };
  const expired: RankedProgram[] = [];
  const notMatched: RankedProgram[] = [];

  for (const result of results) {
    if (result.fitLevel === "NOT_MATCHED") {
      notMatched.push(result);
      continue;
    }

    if (result.effectiveDeadlineStatus === "EXPIRED") {
      expired.push(result);
      continue;
    }

    currentByFit[result.fitLevel].push(result);
  }

  return { currentByFit, expired, notMatched };
}

export function parseMajorItems(majorText: string | null) {
  return Array.from(
    new Set(
      (majorText ?? "")
        .split(/\r?\n|[；;]+/)
        .map((major) => major.trim())
        .filter(Boolean),
    ),
  );
}
