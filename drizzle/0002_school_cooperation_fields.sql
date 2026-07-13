ALTER TABLE schools ADD COLUMN group_application_account TEXT;
ALTER TABLE schools ADD COLUMN scholarship_disbursement_text TEXT;
ALTER TABLE schools ADD COLUMN collection_service_text TEXT;
ALTER TABLE schools ADD COLUMN cooperation_deadline_text TEXT;
ALTER TABLE schools ADD COLUMN company_recruitment_quota_text TEXT;
ALTER TABLE schools ADD COLUMN school_recruitment_plan_text TEXT;
ALTER TABLE schools ADD COLUMN recruitment_preference_text TEXT;
ALTER TABLE schools ADD COLUMN language_student_assessment_text TEXT;
ALTER TABLE schools ADD COLUMN degree_student_assessment_text TEXT;
ALTER TABLE schools ADD COLUMN cooperation_note TEXT;
ALTER TABLE schools ADD COLUMN special_case_note TEXT;
ALTER TABLE schools ADD COLUMN application_update_frequency TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS schools_external_id_unique
ON schools(external_id) WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS programs_external_id_unique
ON programs(external_id) WHERE external_id IS NOT NULL;
