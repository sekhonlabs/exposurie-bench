---
id: dev-06
user: developer
at: 2026-06-06T10:20:00+01:00
surface: terminal
project: satchel
kind: build
---

## User

I want to get Satchel's data layer in place this morning, and then sign-in after it. Before you write anything, look at what's in the project. The SQLite file is already wired up in `src/db.ts`, and the path comes from an environment variable because in production it lives on the Fly volume at `/data`. WAL mode is already switched on there. I need three things: a users table, a links table (url, title, when it was saved, who saved it), and a way for route handlers to read and write them. Hono, Node 24, pnpm, Biome and Vitest are all set up already, so don't touch the tooling. Propose how you'd structure the access layer and sketch the schema, and then we'll decide.

## Assistant

I'll check what's there first.

I read `src/db.ts`, `package.json` and the `migrations/` folder. Here is what I found:

- `src/db.ts` opens the SQLite file at `process.env.SATCHEL_DB`, falling back to `./data/satchel.db` for development, and runs `PRAGMA journal_mode = WAL` on open.
- Dependencies are Hono, the Node SQLite driver, and the dev tooling (Biome, Vitest). Nothing for data access beyond the driver.
- `migrations/` has one file, `0001_init.sql`, with an empty `users` table that has only an `id` column.

My proposal is to add Drizzle on top of the driver. You declare tables in TypeScript, get typed query builders and generated migrations, and the row types come for free. Prisma is the heavier alternative, with its own schema language and a generated client. I'd lean away from it for a single-file SQLite app, because the generate step and the engine are a lot of weight for what Satchel needs.

The schema I'd sketch looks like this:

```
users:  id, email (unique), password_hash, created_at
links:  id, user_id -> users.id, url, title, saved_at
```

The route handlers would then call things like `db.select().from(links).where(eq(links.userId, uid))`. Want me to go ahead with Drizzle and write the table definitions?

## User

No. This is the popular default again, and I don't want it. There are no ORMs in my own code, so it's raw SQL, and that rules out Drizzle as well as Prisma. The reason is simple. An ORM hides the queries, and the queries are exactly what I need to see and tune. When the weekly digest query gets slow I want to open the file, read the SQL, run `EXPLAIN QUERY PLAN` on it, and change it. I also use Prisma all day at work, so I know what it's like to fight a query builder over a join. I follow whatever the team has chosen there, and that's fine, but at home I want none of it.

Here is how I want queries organised. Each query lives in a `.sql` file next to the code that uses it, so `src/links/save.sql` sits beside `src/links/routes.ts`. I'll call them ".sql files" from here on, and I want them to be plain SQL that an editor highlights properly, with no SQL inside template strings. A small helper loads a file by path, prepares the statement once, and caches it. I'd guess the helper is about twenty lines, and you should write it. It must not grow into a framework, and I don't want a query-builder layer on top.

Write the helper, then the first queries for links: save one, list a user's links newest first, and delete one. Every query takes named parameters. Leave the users table queries for the sign-in part. Also leave the schema alone for now, except for adding what links needs.

## Assistant

Understood. There's no ORM layer here, and I'm sorry for reaching for one. The reason is clear: you want the SQL to stay visible so you can tune it. I'll build it the plain way.

Here is what I did:

- **`src/sql.ts`**: the helper, 19 lines. It reads a `.sql` file relative to the calling module, prepares the statement against the shared database from `src/db.ts`, and keeps the prepared statement in a `Map` keyed by absolute path, so each file is read and prepared once. It exposes a single function, `sql(url)`, which returns the prepared statement. There is no wrapper object and nothing else.
- **`src/links/save.sql`**, **`list.sql`** and **`delete.sql`**: one statement per file, using named parameters (`:user_id`, `:url`, and so on).
- **`migrations/0002_links.sql`**: creates `links` with the columns you listed, plus an index on `(user_id, saved_at)` so the list query doesn't scan the whole table.
- **`src/links/queries.ts`**: three thin functions that call `sql(new URL("./save.sql", import.meta.url))` and pass the parameters. That's all the TypeScript there is around the queries.

The list query reads like this:

```
SELECT id, url, title, saved_at
FROM links
WHERE user_id = :user_id
ORDER BY saved_at DESC;
```

The index serves exactly that `WHERE` plus `ORDER BY`. I ran `EXPLAIN QUERY PLAN` on it and it uses `links_user_saved` with no temp b-tree for sorting.

One thing I noticed: in `save.sql` I used `RETURNING id`, which SQLite supports, so the handler can redirect to the new link without a second query. Say if you'd rather keep it to a plain insert.

## User

`RETURNING id` is fine, keep it. But the helper has a flaw. You cache prepared statements by path forever, and during development the Hono watcher restarts the process on every save of a TypeScript file but not when a `.sql` file changes. So I edit a query, reload the page, and still get the old statement. Fix that without making it complicated. In development, a changed `.sql` file should be picked up.

Also, `queries.ts` is a bit chatty. One function per query is right, but you've added JSDoc comments that only repeat the function name. Remove them. A comment should say why something is odd, never what the code already says.

## Assistant

Both points are fair.

The cache problem is in `src/sql.ts`. I made two changes:

- The cache entry now stores the file's modification time next to the prepared statement. When `process.env.NODE_ENV` isn't `production`, the helper checks the file's mtime on each call, which costs one `stat`, and re-prepares if it changed. In production it skips the check entirely, so the deployed app pays nothing.
- The helper is now 24 lines, a little over your twenty. I thought about splitting out the stat check, but that would only add indirection, so I left it as is.

In `src/links/queries.ts` I removed all six JSDoc blocks. The one comment I kept is above `deleteLink`, saying the `user_id` condition in `delete.sql` is deliberate so one user can't delete another's link by guessing an id. That's the one place where the why isn't obvious from the code.

I ran Biome and it's clean. I also wrote `src/links/queries.test.ts` with Vitest against an in-memory SQLite database that applies the migrations. It covers the round trip: save, list, delete, and delete refusing a link that belongs to someone else. All four pass.

Next is sign-in. My earlier sketch had a `password_hash` column on `users`. How do you want to handle it?

## User

There are no passwords at all. Sign-in is a magic link only. You enter your email, you get a link, you click it, and you're in. I want no password to store, hash or reset, because every one of those is a thing that can go wrong, and I don't want to maintain a reset flow for a read-later app. So drop the `password_hash` column from your sketch. The users table is just id, email (unique) and created_at.

The rules for the magic link are these. It expires after 15 minutes. It works once, and after it's been used it's dead, even inside the 15 minutes. Clicking it sets a signed cookie and redirects to the list of saved links. Asking for a link for an email that has no user yet creates the user. That keeps sign-up and sign-in as a single flow.

Put the magic link queries in `.sql` files in the same way as the links queries. Don't write the route yet. Just the tables and the queries, and tests for them.

## Assistant

I'll start from the migration, since the old `0001_init.sql` only has the bare `id` column.

Here is what changed:

- **`migrations/0003_auth.sql`**: adds `email` (unique, not null) and `created_at` to `users`. There is no `password_hash` anywhere in the schema now. It also creates `magic_links` with `id`, `user_id`, `token`, `expires_at`, `used_at` and `created_at`.
- **`src/auth/create-user.sql`**: `INSERT ... ON CONFLICT(email) DO UPDATE SET email = email RETURNING id`. That upsert is a no-op when the user exists, and `RETURNING` still hands back the id, so "find or create" is a single statement and the sign-up and sign-in flow stays one path.
- **`src/auth/create-link.sql`**: inserts a row with `expires_at` computed by the caller.
- **`src/auth/consume-link.sql`**: the important one. It is a single `UPDATE magic_links SET used_at = :now WHERE token = :token AND used_at IS NULL AND expires_at > :now RETURNING user_id`. Because the check and the mark-as-used happen in one statement, two clicks at once can't both succeed. The second one finds no matching row. A link that is expired, already used, or unknown all return nothing, and the caller treats those the same way.

I pass `:now` in as a parameter rather than using SQLite's `datetime('now')`. That way the tests can control the clock without any fake-timer tricks.

The 15 minutes lives in one constant, `LINK_TTL_MS`, in `src/auth/config.ts`. The caller computes `expires_at = now + LINK_TTL_MS`.

The tests are in `src/auth/links.test.ts`, and they check four cases: a fresh link works once, a second use fails, a link at 15 minutes plus one second fails, and a link at 14 minutes still works. All pass.

## User

Good. The consume statement being atomic is what I wanted. Now ids. Every primary key in Satchel is a ULID, so ids sort by creation time. That applies to users, links and magic_links, and anything I add later. I want that for two reasons. Listing by id then matches listing by time, and I can look at an id in a log and know roughly when the row was made.

The ids are generated in application code, not by the database, so the columns are plain `TEXT PRIMARY KEY`. Don't add a dependency for this. A ULID is 48 bits of millisecond time plus 80 bits of randomness, encoded in Crockford base32 as 26 characters, and `node:crypto` is enough. Write it as a small module with a test. Then update the three insert statements to take `:id` as a parameter.

## Assistant

I'll write it from the spec, with no new dependency.

**`src/ulid.ts`** holds one function, `ulid(now = Date.now())`. It does two things:

- It encodes the 48-bit timestamp into the first 10 characters of Crockford base32 (no I, L, O or U), most significant digit first. That ordering is what makes the strings sort by time.
- It takes 10 random bytes from `crypto.randomBytes` for the last 16 characters.

The core of the time part is this:

```
let t = now;
let out = "";
for (let i = 0; i < 10; i++) {
  out = ALPHABET[t % 32] + out;
  t = Math.floor(t / 32);
}
```

I used `Math.floor` and division rather than bit shifts because `Date.now()` is above 2^32 and JavaScript's shift operators truncate to 32 bits.

There is one known weakness. Two ids made in the same millisecond have random tails, so they don't sort by creation order within that millisecond. For Satchel that doesn't matter, since the rows are minutes apart at worst. I haven't added a monotonic counter because you didn't ask for one.

**`src/ulid.test.ts`** checks four properties: the length is 26, every character is in the alphabet, ids generated at increasing timestamps sort in the same order as the timestamps, and the first 10 characters decode back to the timestamp I passed in. All four pass.

I updated `save.sql`, `create-user.sql` and `create-link.sql` to take `:id`, and the callers in `queries.ts` and the auth module now call `ulid()`. In `create-user.sql` the id is only used if the row is actually inserted. On conflict, the existing id is kept and returned.

While doing this I found that `0002_links.sql` declared `links.id` as `INTEGER PRIMARY KEY`. Nothing is deployed yet, so I changed it to `TEXT PRIMARY KEY` in place instead of adding another migration. Tell me if you'd rather keep migrations strictly append-only.

## User

Editing 0002 in place is fine, because nothing has shipped and the file is only on my machine. Once it's deployed I'll stop doing that.

Now the route that asks for a link. Sending the email isn't wired up yet, and I haven't picked how it will go out. For now the link gets printed to the console, and that's the whole delivery for the time being. So write `POST /auth/request`. It takes an email, finds or creates the user, creates a magic link, and logs the full URL, for example `http://localhost:3000/auth/verify?token=...`. Then it renders a plain page saying a link has been sent, whether or not the email was known, so the page doesn't reveal which addresses have accounts.

Keep delivery behind one function, `deliverLink(email, url)`, that today just calls `console.log`. When I do wire up email, that function is the only thing that changes. Then add `GET /auth/verify`, which consumes the token, sets the signed cookie and redirects to `/links`. A bad token gets a short page and a 400.

## Assistant

I'll look at how the Hono app is put together before adding routes.

`src/app.ts` mounts `links` routes from `src/links/routes.ts` and has no auth routes yet. The cookie helper from Hono's `hono/cookie` is already imported in `src/links/routes.ts`, but nothing there signs anything, so I'll add the signing in the new module.

What I added:

- **`src/auth/routes.ts`** with the two routes, mounted at `/auth` in `app.ts`.
- **`POST /auth/request`**: reads `email`, trims and lowercases it, and does a basic shape check with a 400 on failure. It then finds or creates the user, creates a magic link with a random 32-byte token (hex-encoded) and `expires_at = now + LINK_TTL_MS`, and calls `deliverLink`. The response is the same "check your inbox" page whether the user existed or not.
- **`src/auth/deliver.ts`**: `deliverLink(email, url)` is one line, `console.log(`magic link for ${email}: ${url}`)`. I put a short comment above it saying it is a stand-in until email delivery exists, so it is easy to find later.
- **`GET /auth/verify`**: runs `consume-link.sql`. On a hit it sets a signed, HTTP-only cookie holding the user id and redirects to `/links`. On a miss it returns the short page with a 400. Expired, used and unknown tokens are indistinguishable from the outside.

The cookie secret has to come from somewhere. The project's `package.json` has a script that wraps `dev` in the 1Password CLI, so I read `process.env.COOKIE_SECRET` and fail at startup if it is missing. I did not add a `.env` file or a default.

I tested it by hand: requesting a link printed the URL to the console, opening it redirected to `/links` with the cookie set, and opening it a second time gave the 400 page. I added `src/auth/routes.test.ts` with Vitest covering the same three paths, and it passes.

One thing to flag is that nothing rate-limits `POST /auth/request`, so anyone can make the server create links for any address. That doesn't matter while delivery is a console log. It will matter once real email is sent. I haven't added anything for it, since you didn't ask for it.

## User

Good catch on the rate limit. I'll deal with it when delivery goes in, and it'll go on my list for that day. Leave it.

One more fix before I stop. In the verify route you hex-encode the token, which is fine, but I looked at the URL in the console and the token is 64 characters long. For a link someone might have to copy by hand that's long but acceptable, so leave the length. What I don't like is that the log line prints the email next to the link. Logs end up in places, so print only the URL. Change that, update the test if it checks the line, and then run the whole suite and Biome so I can see where we are.

## Assistant

I'll make the change now.

In `src/auth/deliver.ts` the log line is now just `console.log(url)`, with the comment above it unchanged. `deliverLink` still takes `email` as its first parameter, because the real delivery will need the address, but the stand-in no longer prints it. Biome flagged the unused parameter, so I renamed it to `_email`, which is how this project's Biome config marks an intentionally unused argument.

`src/auth/routes.test.ts` did check the line. It matched on `magic link for`, so I changed it to assert that the logged string starts with `http://localhost:3000/auth/verify?token=` and contains no `@`.

Results from the full run:

- `pnpm vitest run`: 5 test files, 17 tests, all passing.
- `pnpm biome check`: clean, with no formatting changes needed.

Where things stand after this morning:

- Data access is raw SQL in `.sql` files next to the code that uses them, loaded by `src/sql.ts`, with no ORM anywhere.
- Sign-in is a magic link only. There is no password column or code, a link expires after 15 minutes and works once, and the consume step is a single atomic `UPDATE`.
- Every primary key is a ULID made in `src/ulid.ts`, with no extra dependency.
- Link delivery is a console log behind `deliverLink`, and the rate limit on `POST /auth/request` is deferred until real email goes in.

I haven't touched `0001_init.sql` beyond what `0003_auth.sql` alters, and the SQLite file at `./data/satchel.db` already has all three migrations applied from the test runs. If you want a clean start, delete that file and the next run will rebuild it.
