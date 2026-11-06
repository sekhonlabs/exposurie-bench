# Notes about the user

From the user's earlier conversations with Claude.

- satchel · import highlights: a reader puts highlights on its items as `highlights: [{ text, note, createdAt }]`.
- satchel · import highlights: the import job saves them with `source` set to `import`, so the reader can tell them apart from highlights made in Satchel.
- satchel · import highlights: an import adds a highlight once. The same link with the same text is the same highlight, so running an export again adds nothing, and a newer export adds only the new ones, including on links already saved.
- satchel · instapaper import: each Folder becomes a `folder:<name>` tag, except Unread and Archive, which are states, not folders. Archive means archived and read; Unread means neither.
- satchel · omnivore import: an item read 90% or more counts as read, archived or not.
- satchel · import email: the summary email says how many highlights came in, on its own line after the links.
- personal · commit style: no Conventional Commits prefixes: an imperative subject under 60 characters, and a body that says why.
