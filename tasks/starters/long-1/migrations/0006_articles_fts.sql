CREATE VIRTUAL TABLE articles_fts USING fts5(
  title, text, content = 'articles', content_rowid = 'rowid', tokenize = 'porter unicode61'
);

CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts (rowid, title, text) VALUES (new.rowid, new.title, new.text);
END;

CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts (articles_fts, rowid, title, text)
  VALUES ('delete', old.rowid, old.title, old.text);
END;

CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts (articles_fts, rowid, title, text)
  VALUES ('delete', old.rowid, old.title, old.text);
  INSERT INTO articles_fts (rowid, title, text) VALUES (new.rowid, new.title, new.text);
END;
