CREATE TABLE IF NOT EXISTS passages (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  page TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS passages_fts USING fts5(
  body, source, content = 'passages', content_rowid = 'rowid'
);

CREATE TRIGGER IF NOT EXISTS passages_ai AFTER INSERT ON passages BEGIN
  INSERT INTO passages_fts (rowid, body, source) VALUES (new.rowid, new.body, new.source);
END;

CREATE TRIGGER IF NOT EXISTS passages_ad AFTER DELETE ON passages BEGIN
  INSERT INTO passages_fts (passages_fts, rowid, body, source) VALUES ('delete', old.rowid, old.body, old.source);
END;
