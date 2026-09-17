ALTER TABLE wecom_department_roles ADD COLUMN permissions_json TEXT;
ALTER TABLE wecom_user_access ADD COLUMN permissions_json TEXT;
