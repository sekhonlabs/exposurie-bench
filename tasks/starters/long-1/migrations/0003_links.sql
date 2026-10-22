CREATE TABLE links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  saved_at TEXT NOT NULL,
  read_at TEXT,
  archived_at TEXT,
  UNIQUE (user_id, url)
);

CREATE INDEX links_by_user ON links (user_id, saved_at);
