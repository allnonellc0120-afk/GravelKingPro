-- GravelKing Pro schema export
-- Source: current Drizzle schema and development PostgreSQL metadata.
-- Production currently has the lyric tables and users, but does not yet have jobs.

CREATE TABLE IF NOT EXISTS users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar UNIQUE,
  password_hash text,
  first_name varchar,
  last_name varchar,
  profile_bio text,
  profile_image_url varchar,
  is_pro boolean NOT NULL DEFAULT false,
  subscription_tier varchar,
  used_free_split boolean NOT NULL DEFAULT false,
  free_voice_removals integer NOT NULL DEFAULT 0,
  free_stem_splits integer NOT NULL DEFAULT 0,
  free_master_downloads integer NOT NULL DEFAULT 0,
  free_master_previews integer NOT NULL DEFAULT 0,
  total_downloads integer NOT NULL DEFAULT 0,
  stripe_customer_id varchar,
  stripe_subscription_id varchar,
  session_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_submission_date timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_developer boolean NOT NULL DEFAULT false,
  trial_used boolean NOT NULL DEFAULT false,
  monthly_exports integer NOT NULL DEFAULT 0,
  export_period_start timestamptz,
  cert_unlocks integer NOT NULL DEFAULT 0,
  cert_unlock_period_start timestamptz,
  credits_balance integer NOT NULL DEFAULT 0,
  promo_code varchar,
  promo_expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS lyric_projects (
  id text PRIMARY KEY,
  session_id text,
  title text NOT NULL DEFAULT 'Untitled',
  mode text NOT NULL DEFAULT 'simple',
  story_prompt text,
  bpm integer,
  key text,
  vocal_type text,
  genre_tags text,
  ai_draft text NOT NULL,
  current_content text NOT NULL,
  style_prompt text,
  lines_state jsonb,
  authorship_score integer DEFAULT 0,
  is_copyright_eligible boolean DEFAULT false,
  is_ai_only boolean DEFAULT true,
  generation_count integer DEFAULT 1,
  is_locked boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  suno_prompt text,
  genre text
);

CREATE TABLE IF NOT EXISTS lyric_timeline_blocks (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  timestamp_ms integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  section_type text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lyric_revisions (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  content text NOT NULL,
  authorship_score integer DEFAULT 0,
  edit_type text,
  line_index integer,
  original_line_text text,
  regen_instruction text,
  changed_lines jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lyric_forensic_ledger (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  session_id text,
  edit_type text NOT NULL,
  line_index integer,
  original_text text,
  new_text text,
  regen_instruction text,
  levenshtein_delta integer,
  authorship_score_before integer,
  authorship_score_after integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lyric_imports (
  id text PRIMARY KEY,
  session_id text,
  user_id text,
  content_hash text NOT NULL,
  hash_algorithm text NOT NULL DEFAULT 'sha256',
  imported_text text NOT NULL,
  char_count integer NOT NULL DEFAULT 0,
  stamp_type text NOT NULL DEFAULT 'imported_human_original',
  certified_human_author boolean NOT NULL DEFAULT false,
  certification_text text,
  stamped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id varchar(64) PRIMARY KEY,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  type varchar(32) NOT NULL DEFAULT 'mastering',
  status varchar(16) NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  stage varchar(64) NOT NULL DEFAULT 'queued',
  original_filename varchar(255),
  input_ref text,
  request_config jsonb,
  output_object_key text,
  output_url text,
  download_filename varchar(255),
  error text,
  client_job_id varchar(128),
  idempotency_key varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS master_jobs_user_created_idx ON jobs (user_id, created_at);
CREATE INDEX IF NOT EXISTS master_jobs_status_updated_idx ON jobs (status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS master_jobs_client_job_id_unique ON jobs (client_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS master_jobs_idempotency_key_unique ON jobs (idempotency_key);