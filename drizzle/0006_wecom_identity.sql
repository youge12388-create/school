ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE users ADD COLUMN wecom_user_id TEXT;
ALTER TABLE users ADD COLUMN wecom_enabled INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX users_wecom_user_id_unique ON users(wecom_user_id);

CREATE TABLE wecom_departments (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  parent_id INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX wecom_departments_parent_idx ON wecom_departments(parent_id);

CREATE TABLE wecom_department_roles (
  department_id INTEGER PRIMARY KEY NOT NULL REFERENCES wecom_departments(id),
  role TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE wecom_user_departments (
  user_id TEXT NOT NULL REFERENCES users(id),
  department_id INTEGER NOT NULL REFERENCES wecom_departments(id),
  PRIMARY KEY (user_id, department_id)
);
CREATE INDEX wecom_user_departments_department_idx
  ON wecom_user_departments(department_id);
