CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  run_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TEXT,
  done_at TEXT,
  last_error TEXT
);

CREATE INDEX jobs_due ON jobs (run_at) WHERE done_at IS NULL;
