DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('Admin', 'Sales', 'Planner', 'Purchase', 'Technical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'Sales',
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_activity_seen_id BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS parts (
  id BIGSERIAL PRIMARY KEY,
  part_no TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  supplier TEXT NOT NULL DEFAULT '',
  amc_month_1 NUMERIC(10,2),
  amc_month_2 NUMERIC(10,2),
  amc_month_3 NUMERIC(10,2),
  stock INTEGER,
  back_order INTEGER,
  cov NUMERIC(10,2),
  cov_days NUMERIC(10,2),
  eta DATE,
  assigned_role user_role,
  remark TEXT NOT NULL DEFAULT '',
  comments TEXT NOT NULL DEFAULT '',
  updated_by BIGINT REFERENCES app_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS amc_month_1 NUMERIC(10,2);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS amc_month_2 NUMERIC(10,2);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS amc_month_3 NUMERIC(10,2);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS cov_days NUMERIC(10,2);
UPDATE parts SET cov_days=cov*7,cov=NULL WHERE cov_days IS NULL AND cov IS NOT NULL;
CREATE INDEX IF NOT EXISTS parts_updated_at_idx ON parts(updated_at DESC);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_activity_seen_id BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  part_no TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log(created_at DESC);
CREATE TABLE IF NOT EXISTS workspace_messages (
  id BIGSERIAL PRIMARY KEY,
  author_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) BETWEEN 0 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workspace_messages_created_at_idx ON workspace_messages(created_at DESC);
ALTER TABLE workspace_messages ALTER COLUMN body SET DEFAULT '';
ALTER TABLE workspace_messages DROP CONSTRAINT IF EXISTS workspace_messages_body_check;
ALTER TABLE workspace_messages ADD CONSTRAINT workspace_messages_body_check CHECK (char_length(body) BETWEEN 0 AND 2000);
CREATE TABLE IF NOT EXISTS workspace_chat_files (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES workspace_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size BETWEEN 1 AND 8388608),
  file_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workspace_chat_files_message_id_idx ON workspace_chat_files(message_id);
