CREATE TABLE wecom_user_access (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('INHERIT', 'ROLE', 'DENY')),
  role TEXT CHECK (role IN ('ADMIN', 'ADVISOR', 'DATA_MANAGER', 'CHANNEL_RESOURCE', 'MARKET_MANAGER')),
  updated_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK (
    (mode = 'ROLE' AND role IS NOT NULL)
    OR (mode IN ('INHERIT', 'DENY') AND role IS NULL)
  )
);

CREATE INDEX wecom_user_access_updated_idx
  ON wecom_user_access(updated_at);
