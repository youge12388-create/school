CREATE TABLE screening_plans (
  id TEXT PRIMARY KEY NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  student_name TEXT,
  student_region TEXT,
  preferred_region TEXT,
  notes TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('ai', 'manual')),
  criteria_json TEXT NOT NULL,
  request_hash TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX screening_plans_created_idx ON screening_plans(created_at, id);
CREATE INDEX screening_plans_author_idx ON screening_plans(created_by, created_at, id);

CREATE TABLE screening_plan_items (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES screening_plans(id),
  program_id TEXT NOT NULL,
  school_id TEXT NOT NULL,
  school_name TEXT,
  school_region TEXT,
  program_name TEXT,
  rank INTEGER NOT NULL,
  fit_level TEXT NOT NULL,
  reason TEXT,
  evidence_json TEXT NOT NULL,
  facts_json TEXT,
  UNIQUE(plan_id, program_id)
);
CREATE INDEX screening_plan_items_rank_idx ON screening_plan_items(plan_id, rank);

-- Copy historical records once. Keep their IDs so saved/printed links still work.
-- Legacy nationality is not a student's place of residence.
WITH legacy AS (
  SELECT r.*, CASE WHEN json_valid(r.criteria_json) THEN r.criteria_json ELSE '{}' END AS valid_json
  FROM recommendations r
), profiles AS (
  SELECT l.*,
    CASE WHEN json_type(l.valid_json, '$.criteria') = 'object'
      THEN json_extract(l.valid_json, '$.criteria') ELSE l.valid_json END AS filters
  FROM legacy l
)
INSERT INTO screening_plans
  (id, created_by, title, student_name, student_region, preferred_region, notes, mode, criteria_json, created_at)
SELECT l.id, l.created_by, l.title,
  COALESCE(CASE WHEN json_type(l.valid_json, '$.recordProfile.studentName') = 'text'
    THEN NULLIF(trim(json_extract(l.valid_json, '$.recordProfile.studentName')), '') END, NULLIF(trim(c.name), '')),
  CASE WHEN json_type(l.valid_json, '$.recordProfile.studentRegion') = 'text'
    THEN NULLIF(trim(json_extract(l.valid_json, '$.recordProfile.studentRegion')), '') END,
  COALESCE(
    CASE WHEN json_type(l.valid_json, '$.recordProfile.preferredRegion') = 'text'
      THEN NULLIF(trim(json_extract(l.valid_json, '$.recordProfile.preferredRegion')), '') END,
    NULLIF(concat_ws(' · ',
      CASE WHEN json_type(l.filters, '$.province') = 'text' THEN NULLIF(trim(json_extract(l.filters, '$.province')), '') END,
      CASE WHEN json_type(l.filters, '$.city') = 'text' THEN NULLIF(trim(json_extract(l.filters, '$.city')), '') END), ''),
    NULLIF(concat_ws(' · ', NULLIF(trim(c.preferred_province), ''), NULLIF(trim(c.preferred_city), '')), '')
  ),
  l.notes, CASE WHEN json_extract(l.valid_json, '$.mode') = 'AI_SCREENING' THEN 'ai' ELSE 'manual' END,
  l.criteria_json, l.created_at
FROM profiles l LEFT JOIN customers c ON c.id = l.customer_id;

INSERT INTO screening_plan_items
  (id, plan_id, program_id, school_id, school_name, school_region, program_name, rank, fit_level, reason, evidence_json, facts_json)
SELECT i.id, i.recommendation_id, i.program_id, COALESCE(p.school_id, 'legacy-program:' || i.program_id),
  s.name_zh, NULLIF(concat_ws(' · ', NULLIF(trim(s.province), ''), NULLIF(trim(s.city), '')), ''),
  p.name, i.rank, i.fit_level, i.reason, i.evidence_json,
  CASE WHEN saved.mode = 'manual' AND p.id IS NOT NULL THEN
    json_object('programType', p.program_type, 'language', p.teaching_language,
      'majorText', p.major_text, 'tuitionText', p.tuition_text,
      'firstYearCostMax', p.first_year_cost_max, 'deadlineAt', p.deadline_date)
  END
FROM recommendation_items i
JOIN screening_plans saved ON saved.id = i.recommendation_id
LEFT JOIN programs p ON p.id = i.program_id
LEFT JOIN schools s ON s.id = p.school_id;
