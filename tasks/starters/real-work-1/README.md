# commonplace

A commonplace book on the web: the passages worth keeping from whatever I'm reading, with where each one came from. One page to add a passage, one to search them.

Hono renders the HTML on the server and htmx handles the form. The data is one SQLite file, and every query lives in its own `.sql` file under `src/queries/`.

```
pnpm install
pnpm dev        # http://localhost:3000
pnpm test
pnpm lint
```

`DATABASE_PATH` sets where the database file goes (default `commonplace.db` in the working folder) and `PORT` the port (default 3000).
