INSERT INTO articles (link_id, title, byline, site_name, text, word_count, fetched_at)
VALUES (:link_id, :title, :byline, :site_name, :text, :word_count, :now)
ON CONFLICT (link_id) DO UPDATE SET
  title = excluded.title,
  byline = excluded.byline,
  site_name = excluded.site_name,
  text = excluded.text,
  word_count = excluded.word_count,
  fetched_at = excluded.fetched_at;
