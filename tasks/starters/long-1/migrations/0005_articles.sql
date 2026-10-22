CREATE TABLE articles (
  link_id TEXT PRIMARY KEY REFERENCES links (id) ON DELETE CASCADE,
  title TEXT,
  byline TEXT,
  site_name TEXT,
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);
