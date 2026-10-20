---
id: dev-16
user: developer
at: 2026-07-18T15:30:00+01:00
surface: terminal
project: fieldnotes
kind: build
---

## User

I want to set up fieldnotes, my blog, from an empty folder at /Users/dev/code/fieldnotes. Here is how I want it built, so please don't reach for your usual defaults.

The generator is Eleventy. I know you'd suggest Hugo or Astro first. I'm skipping Hugo because I'd have to carry a second toolchain and a templating language I don't use anywhere else, when everything else I write runs on Node 24 with pnpm. I'm skipping Astro because it brings a component model and a build pipeline to what is just text. I want the output to be the HTML I wrote and nothing more.

For now, scaffold the project with pnpm, add Eleventy as the one dependency, and set the input to `src` and the output to the default `_site`. Don't add anything else without asking me. I'll go through hosting and the rest next.

## Assistant

The folder is empty, so I'm starting from scratch. I'll initialise it with pnpm and add Eleventy.

Done:

- `package.json` is created with `"type": "module"`, an engines field pinned to Node 24, and two scripts: `build` (`eleventy`) and `dev` (`eleventy --serve`).
- Eleventy is the only dependency, as a dev dependency. I added nothing else.
- `eleventy.config.js` sets `dir.input` to `src`, keeps the default output `_site`, and keeps the includes folder at `src/_includes`.
- `src/index.html` is a placeholder, so the first build has something to render.

A build produces `_site/index.html` with no errors. I haven't touched formatting or linting config because you haven't mentioned any for this project.

What's next: hosting, or the layout?

## User

Hosting first. It goes on Fly.io, like everything else I run myself: one bill, one dashboard. Netlify is the obvious free option, and I'm skipping it for exactly that reason. I don't want one stray site living in a separate account.

Inside the Fly app, Caddy serves the static files. So the image build has two stages: the first runs the Eleventy build on Node 24 with pnpm, and the second is a small Caddy image that copies in `_site` and serves it. Use region ams. No volume is needed, since there's no database and nothing is written at runtime.

Write the image file, the Caddyfile and `fly.toml`, but don't deploy yet. I want the layout in place first.

## Assistant

Here is what I wrote.

- `Dockerfile` has the two stages you described. The first stage enables pnpm through corepack, installs from the lockfile with `--frozen-lockfile`, and runs `pnpm build`. The second stage is the Caddy image with `_site` copied to `/srv`.
- `Caddyfile` is below.
- `fly.toml` sets the app name to `fieldnotes`, `primary_region = "ams"`, HTTP service on internal port 8080, forced HTTPS, and no volume or mounts. I set `auto_stop_machines` so it can stop when idle and wake on the next request.

```
:8080 {
	root * /srv
	encode zstd gzip
	file_server
}
```

Eleventy writes each post as `slug/index.html`, so `file_server` serves `/posts/some-slug/` with no rewrite rules needed. I left the admin endpoint at its default and added nothing else. I haven't run `fly launch` or `fly deploy`.

## User

Good. Now two decisions that affect the layout.

Analytics: GoatCounter, not Google Analytics. I don't want a cookie banner and I don't want to hand readers' visits to an ad company. Add the GoatCounter script to the base layout just before the closing body tag. I'll create the site code on their side, so leave a clearly marked placeholder and don't invent one.

Comments: there is no comment section. Readers can email, so put a plain mailto link in the footer, `notes@example.com`. Don't add a form, a widget or a comment-system dependency of any kind.

## Assistant

Both are in `src/_includes/base.html`.

- The GoatCounter script tag sits just before `</body>`. It uses `data-goatcounter="https://YOUR-SITE-CODE.goatcounter.com/count"` and loads the counter script with `async`. `YOUR-SITE-CODE` is the placeholder, and I put an HTML comment above it saying to replace it before deploying. Do you want me to make the build fail while the placeholder is still there? It's a cheap check, but I haven't added it since you didn't ask.
- The footer has one line, "Replies welcome, by email", linking to `mailto:notes@example.com`. There is no form, no script and no extra dependency.

The layout also has the usual head: charset, viewport, a title built from the page title and the site name, and a link to `/style.css`.

## User

Yes, add the check, but make it a build-time check in the Eleventy config that only runs for the production build, so the dev server still works. Keep it short.

Then the styling. The accent colour is #B4462F, a brick red. Use it for links, and only links. Don't set any other colours at all. I don't want a palette, so let the browser's own defaults handle text and background. And don't reach for a dark-mode toggle script, which is what everyone does. If the reader's system wants dark, the page should follow it with no JavaScript.

## Assistant

The check is in `eleventy.config.js`. It runs in the `eleventy.before` event and reads `process.env.ELEVENTY_RUN_MODE`. When that equals `build` and the base layout still contains `YOUR-SITE-CODE`, it throws with a message naming the file. The dev server runs in `serve` mode, so it skips the check. It's about eight lines and has no dependency.

For `src/style.css` I did this:

```
:root {
	color-scheme: light dark;
	--accent: #B4462F;
}
a { color: var(--accent); }
```

- `color-scheme: light dark` lets the browser choose its own text and background for the reader's system setting. That gives dark-mode behaviour with no script and no second palette.
- The accent is used only on links. Body text, background and borders are untouched.
- One caveat: brick red on a dark browser background has weaker contrast than on a light one. I can't see how it renders from here, so check it when you open the page. If it's too dim in dark mode, the fix would be a second accent value, which means another colour, so I left it alone.

I also set a readable measure (`max-width: 40rem`, centred, with side padding), a system font stack and a line height of 1.6. I didn't load any web fonts.

## User

I'll check the dark rendering in the browser later. Keep the system font stack.

Now the first post template. Posts live in `src/posts/` and the URL is `/posts/<slug>/`. Front matter has `title`, `date` and an optional `summary`. The template shows the title, the date in ISO form, the body, and then the same email line as the footer, so a reader who finishes a post sees how to reply. Add an index page that lists posts newest first. Write one short real post to try it, about setting this site up. Three or four sentences.

## Assistant

I looked at `src/_includes/base.html` first so the new layout extends it.

- `src/_includes/post.html` uses the base layout and renders the title as an `h1`, the date in a `time` element with the ISO date, and then the content. After the content it adds a short "Reply by email" paragraph with the same `mailto:` link as the footer.
- `src/posts/posts.json` is the directory data file. It sets the layout to `post.html`, the permalink to `/posts/{{ page.fileSlug }}/`, and a `posts` tag.
- `src/index.html` loops over the collection in reverse date order, with the title linking to the post, the ISO date, and the summary when present.
- The first post is `src/posts/setting-up-fieldnotes.md`. It says why the site is static, that Caddy serves the files from the Fly app, and that readers can reply by email. It's four sentences.

I had to add a date filter to the Eleventy config, because Eleventy doesn't format dates by itself. It's one small function that returns the ISO string and needs no library. A build now writes `_site/index.html` and `_site/posts/setting-up-fieldnotes/index.html`, and the index lists the one post.

## User

Open the built post page and check it before we deploy. I want the title, the date, the footer link and the script tag all there, and the placeholder still failing the production build.

## Assistant

Checked in `_site/posts/setting-up-fieldnotes/index.html`:

- The `h1` and the `time` element with the ISO date are present.
- The email line appears twice, once after the post body and once in the footer. Both are `mailto:notes@example.com`.
- The GoatCounter script tag is there, just before `</body>`, with the placeholder.
- `pnpm build` fails with the message about `YOUR-SITE-CODE`. `pnpm dev` starts normally and serves the same page.

One small thing I found: the index page had no `lang` attribute on the `html` element. I added `lang="en"` to the base layout so the post and index both have it.

## User

Fine. I've created the GoatCounter site, and the code is `fieldnotes-blog`. Put it in, then deploy. The Fly app doesn't exist yet, so create it from the `fly.toml` you wrote and don't let the launch command overwrite it.

## Assistant

I replaced the placeholder in `src/_includes/base.html` with `fieldnotes-blog`. The production build now passes the check.

I ran `fly launch --no-deploy --copy-config --name fieldnotes`, so it kept the existing `fly.toml` and region `ams`. Then I ran `fly deploy`.

The first deploy failed its health check. The Caddyfile listens on 8080, but the launch command had rewritten nothing, and the `[http_service]` block still pointed at port 80 because I had typed `internal_port = 80` from habit. That was my mistake, and I had told you it was 8080. I changed it to `internal_port = 8080` and deployed again.

The second deploy passed:

- One machine is running in `ams`.
- `https://fieldnotes.fly.dev/` returns the index with the one post listed.
- `/posts/setting-up-fieldnotes/` returns the post with the footer link.
- The GoatCounter script tag carries `fieldnotes-blog`.

I haven't checked that GoatCounter has recorded a visit, since that happens on their side. Open the page once in a browser and look at the dashboard.

## User

Commit it. Imperative subject under 60 characters, and a body that says why, not what. No prefixes.

## Assistant

The repository wasn't initialised, so I ran `git init` first and added a `.gitignore` for `node_modules` and `_site`.

The commit:

```
Set up fieldnotes as a static Eleventy site

A blog with no database or runtime state needs only built HTML
behind a small file server. Caddy in the Fly app keeps it on the
same bill and dashboard as everything else, and the fixed
GoatCounter script avoids cookies and a banner.
```

The subject is 41 characters. `fly.toml` records the corrected port, so the history shows the working configuration. Your next step is to look at the dark-mode contrast on the links.
