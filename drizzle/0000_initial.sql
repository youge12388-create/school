CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADVISOR',
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT,
  preview_path TEXT,
  imported_by TEXT REFERENCES users(id),
  confirmed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE schools (
  id TEXT PRIMARY KEY NOT NULL,
  external_id TEXT,
  name_zh TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  province TEXT,
  city TEXT,
  website TEXT,
  qs_ranking INTEGER,
  ranking_info TEXT,
  partnership_rating INTEGER NOT NULL DEFAULT 0,
  csca_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  tags TEXT,
  description TEXT,
  cooperation_programs TEXT,
  raw_json TEXT,
  source_batch_id TEXT REFERENCES import_batches(id),
  review_status TEXT NOT NULL DEFAULT 'AUTO_PARSED',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE programs (
  id TEXT PRIMARY KEY NOT NULL,
  external_id TEXT,
  school_id TEXT NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  program_type TEXT NOT NULL,
  teaching_language TEXT NOT NULL,
  tags TEXT,
  introduction TEXT,
  duration TEXT,
  duration_note TEXT,
  major_text TEXT,
  direction_text TEXT,
  requirements_text TEXT,
  semester_text TEXT,
  application_time_text TEXT,
  scholarship_category TEXT,
  scholarship_content TEXT,
  scholarship_note TEXT,
  scholarship_deadline_text TEXT,
  accommodation_text TEXT,
  insurance_text TEXT,
  application_fee_text TEXT,
  scholarship_application_fee_text TEXT,
  fee_note TEXT,
  tuition_text TEXT NOT NULL,
  tuition_min REAL,
  tuition_max REAL,
  tuition_period TEXT,
  accommodation_min REAL,
  accommodation_max REAL,
  insurance_max REAL,
  application_fee_max REAL,
  first_year_cost_max REAL,
  cost_incomplete INTEGER NOT NULL DEFAULT 1,
  csca_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  hsk_level_min INTEGER,
  hsk_score_min INTEGER,
  ielts_min REAL,
  toefl_min INTEGER,
  duolingo_min INTEGER,
  gpa_min REAL,
  gpa_scale REAL,
  min_age INTEGER,
  max_age INTEGER,
  deadline_date INTEGER,
  deadline_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  parsed_json TEXT,
  raw_json TEXT,
  source_batch_id TEXT REFERENCES import_batches(id),
  review_status TEXT NOT NULL DEFAULT 'AUTO_PARSED',
  manually_verified INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX programs_school_idx ON programs(school_id);
CREATE INDEX programs_filter_idx ON programs(program_type, teaching_language, archived);
CREATE TABLE program_majors (
  id TEXT PRIMARY KEY NOT NULL,
  program_id TEXT NOT NULL REFERENCES programs(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE(program_id, name)
);
CREATE INDEX program_major_normalized_idx ON program_majors(normalized_name);
CREATE TABLE major_synonyms (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  keyword TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE(category, keyword)
);
CREATE TABLE customers (
  id TEXT PRIMARY KEY NOT NULL,
  customer_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  nationality TEXT,
  phone TEXT,
  email TEXT,
  wechat TEXT,
  current_education TEXT,
  school_background TEXT,
  gpa REAL,
  gpa_scale REAL,
  hsk_level INTEGER,
  hsk_score INTEGER,
  ielts REAL,
  toefl INTEGER,
  duolingo INTEGER,
  has_csca INTEGER,
  target_degree TEXT,
  target_major TEXT,
  teaching_language TEXT,
  intake_year INTEGER,
  first_year_budget REAL,
  preferred_province TEXT,
  preferred_city TEXT,
  scholarship_required INTEGER,
  accommodation_required INTEGER,
  date_of_birth INTEGER,
  owner_id TEXT REFERENCES users(id),
  notes TEXT,
  next_follow_up_at INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX customers_owner_idx ON customers(owner_id, archived);
CREATE INDEX customers_followup_idx ON customers(next_follow_up_at);
CREATE TABLE follow_ups (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,
  content TEXT NOT NULL,
  next_follow_up_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX followups_customer_idx ON follow_ups(customer_id, created_at);
CREATE TABLE recommendations (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  criteria_json TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX recommendations_customer_idx ON recommendations(customer_id);
CREATE TABLE recommendation_items (
  id TEXT PRIMARY KEY NOT NULL,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  program_id TEXT NOT NULL REFERENCES programs(id),
  rank INTEGER NOT NULL,
  fit_level TEXT NOT NULL,
  reason TEXT,
  evidence_json TEXT NOT NULL,
  UNIQUE(recommendation_id, program_id)
);
CREATE TABLE applications (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  program_id TEXT NOT NULL REFERENCES programs(id),
  owner_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'MATERIAL_PREPARATION',
  notes TEXT,
  submitted_at INTEGER,
  result_at INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX applications_status_idx ON applications(status, archived);
CREATE INDEX applications_customer_idx ON applications(customer_id);
CREATE TABLE application_events (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX application_events_app_idx ON application_events(application_id, created_at);
CREATE TABLE documents (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  application_id TEXT REFERENCES applications(id),
  category TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_tag TEXT NOT NULL,
  checksum TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX documents_customer_idx ON documents(customer_id, archived);
CREATE INDEX documents_application_idx ON documents(application_id);
