CREATE TABLE highlights (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX highlights_by_link ON highlights (link_id);
