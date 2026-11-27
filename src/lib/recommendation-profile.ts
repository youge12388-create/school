export const RECOMMENDED_PER_TIER_COUNT = 3;
export const RECOMMENDED_SCHOOL_COUNT = 9;
export const DEFAULT_DISPLAY_SCHOOL_COUNT = 9;
export const MAX_PLAN_ITEMS = 30;

export const RECOMMENDATION_FIELD_LIMITS = {
  title: 80,
  studentName: 120,
  region: 120,
  notes: 600,
} as const;

export type RecommendationProfile = {
  studentName: string;
  studentRegion: string;
  preferredRegion: string;
  notes: string;
};

export function planRegion(province?: string | null, city?: string | null) {
  return [...new Set([province?.trim(), city?.trim()].filter(Boolean))].join(" · ");
}

export function groupPlanSchools<Item extends { schoolId: string }>(items: readonly Item[]) {
  const schools = new Map<string, Item[]>();
  for (const item of items) {
    const projects = schools.get(item.schoolId);
    if (projects) projects.push(item);
    else schools.set(item.schoolId, [item]);
  }
  return [...schools.values()];
}
