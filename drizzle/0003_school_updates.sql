CREATE TABLE IF NOT EXISTS school_updates (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  school_id TEXT NOT NULL REFERENCES schools(id),
  title TEXT,
  submitter TEXT,
  submitted_at INTEGER,
  public_content TEXT,
  public_url TEXT,
  public_operator TEXT,
  public_updated_at INTEGER,
  secret_content TEXT,
  secret_url TEXT,
  secret_operator TEXT,
  secret_updated_at INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS school_updates_external_id_unique
ON school_updates(external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS school_updates_school_idx
ON school_updates(school_id, archived);

CREATE TABLE IF NOT EXISTS school_update_attachments (
  id TEXT PRIMARY KEY,
  school_update_id TEXT NOT NULL REFERENCES school_updates(id),
  group_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_tag TEXT NOT NULL,
  checksum TEXT NOT NULL,
  uploaded_by TEXT REFERENCES users(id),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS school_update_attachments_update_idx
ON school_update_attachments(school_update_id, archived);
