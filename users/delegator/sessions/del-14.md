---
id: del-14
user: delegator
at: 2026-08-15T14:20:00+01:00
surface: desktop
project: quiet-youtube
kind: build
---

## User
make youtube stop sucking me in

## Assistant
I looked at `/Users/user/Documents/quiet-youtube`. It's empty, so we're starting fresh.

The simplest fix is a small browser add-on that hides the parts of YouTube that pull you in. Before I build anything I need to know which browser you use. Is it Chrome?

## User
Firefox

## Assistant
Good, Firefox it is. That changes how the add-on gets installed later, but I'll handle that and tell you exactly what to click when we get there.

One more question first: which parts of YouTube should disappear? The usual suspects are:

- the recommendations on the homepage
- Shorts
- the suggested videos beside and under a video
- comments

## User
homepage recs and Shorts. not comments, i like reading them

## Assistant
Done deciding, then. Homepage recommendations and Shorts get hidden, and comments stay exactly as they are.

I created these files in the project folder:

- `manifest.json`: the add-on's ID card. It tells Firefox the name, the version, and that the add-on only runs on youtube.com.
- `hide.css`: the list of things to hide.
- `content.js`: a tiny script that turns the hiding on and off.

The core of `hide.css` looks like this:

```
ytd-browse[page-subtype="home"] ytd-rich-grid-renderer {
  display: none !important;
}
ytd-rich-shelf-renderer[is-shorts],
ytd-reel-shelf-renderer,
ytd-guide-entry-renderer:has(a[title="Shorts"]) {
  display: none !important;
}
```

The first rule empties the homepage grid. The second removes the Shorts rows from search results and the homepage, plus the Shorts entry in the left menu. Nothing in there touches the comments section.

I haven't tried it in Firefox yet. The next step is for you to load it temporarily so we can see it working. Want to do that now?

## User
ok do that

## Assistant
Here's how, with Firefox open:

1. In the address bar type `about:debugging` and press Enter.
2. On the left, click **This Firefox**.
3. Click **Load Temporary Add-on…**
4. In the window that opens, go to `Documents` → `quiet-youtube` and pick the file called `manifest.json`.
5. Open a new tab and go to youtube.com.

The homepage should now be mostly empty, with no grid of videos. Shorts should be gone from the left menu too.

This way of loading is only for trying things out. Firefox forgets it when you close the browser, and I'll sort out making it permanent after this.

## User
shorts still in the sidebar

## Assistant
Thanks, that tells me where to look. I checked `hide.css` and found the problem: I matched the Shorts menu entry by its tooltip text, and YouTube's narrow sidebar doesn't use the same tooltip. In that layout the entry is a different element, `ytd-mini-guide-entry-renderer`.

I changed two things:

- Added the narrow-sidebar entry to the list of hidden things.
- Added a rule that hides any link pointing to `/shorts`, so a layout change on YouTube's side is less likely to bring it back.

To pick up the change:

1. Go back to `about:debugging` → **This Firefox**.
2. Find the entry for the add-on and click **Reload**.
3. Refresh the YouTube tab.

Tell me what you see in the sidebar now.

## User
gone. but i want to turn it off sometimes

## Assistant
Makes sense. Sometimes you actually need to find a video on the homepage, or a tutorial is only a Short.

My suggestion: a button in the Firefox toolbar. One click turns the add-on off for 20 minutes, then it switches itself back on. You don't have to remember to turn it on again, which is the part that usually fails. Clicking it a second time while it's off ends the break early.

If you'd rather have a different length, say so. Otherwise I'll go with 20 minutes.

## User
20 is fine, do it

## Assistant
Added. Here's what changed:

- `manifest.json` now has a toolbar button (the small icon next to the address bar) and permission to store a setting and run a timer.
- New file `background.js` handles the button click. When you click it, it saves "paused until" as the time 20 minutes from now and sets a timer for that moment. When the timer goes off, it clears the pause.
- `content.js` now checks that saved time. If it's in the future, the page is left alone. If not, hiding is switched on. It updates straight away, so you don't need to refresh YouTube.
- New file `icon.svg`, a plain leaf-shaped mark in #2F6B4F on a #FAF7F2 background, so the button is easy to spot.

The click handler is small:

```
browser.action.onClicked.addListener(async () => {
  const { pausedUntil } = await browser.storage.local.get("pausedUntil");
  const paused = pausedUntil && pausedUntil > Date.now();
  const next = paused ? 0 : Date.now() + 20 * 60 * 1000;
  await browser.storage.local.set({ pausedUntil: next });
  browser.alarms.create("resume", { when: next || Date.now() });
});
```

To try it, reload the add-on in `about:debugging` as before, then:

1. Open youtube.com. The homepage should be empty.
2. Click the new icon in the toolbar. The recommendations and Shorts should appear within a second.
3. Click the icon again. They should disappear.

To check the full 20 minutes you'd have to wait that long, so I tested the timer logic with a 10-second version and it switched back on correctly. The real value is back to 20 minutes.

## User
works. needs a name

## Assistant
How about **Quiet**? It's short, it says what the add-on does, and it will look fine as a label under the toolbar button.

I'll use it in `manifest.json` (the name shown in Firefox's add-on list) and as the button's tooltip. The tooltip will read "Quiet: off for 20 minutes" when you hover, so you remember what a click does.

## User
love it

## Assistant
Great. It's called Quiet now, in `manifest.json` and on the button tooltip. I also renamed the zip I'll be producing to `quiet.zip` so everything matches.

One last thing is making it permanent. Firefox only keeps add-ons that have been signed, and the temporary loading you've been doing disappears every time you close the browser.

## User
will it stay after restart

## Assistant
Not yet, but it will after the next steps. The way to do it is to get Firefox to sign the add-on as an **unlisted** add-on. Unlisted means it isn't published in the public add-on store. Nobody else can find it, and only you use it. Firefox still checks it and gives you a signed file that stays installed through restarts.

I've already made the file you need to upload: `/Users/user/Documents/quiet-youtube/dist/quiet.zip`. I also added a permanent ID for the add-on to `manifest.json` (`quiet@example.com`), because signing needs one.

You do the clicking, in this order:

1. In Firefox, ask the address bar for "Firefox Add-on Developer Hub" and open the result.
2. Log in, or make a free account if you don't have one.
3. Click **Submit a New Add-on**.
4. When it asks how to distribute, choose **On your own**. This is the unlisted choice.
5. Click **Select a file…** and pick `quiet.zip` from the `dist` folder inside `quiet-youtube`.
6. Wait for the green tick on the automatic check. If it shows warnings but no errors, carry on.
7. Click **Continue** until you reach the end of the form. You can leave any optional fields empty.
8. A minute or two later, the page shows a download link for the signed file. It ends in `.xpi`. Click it and save the file somewhere you'll find it, like `Downloads`.

Then install it:

1. In Firefox, click the menu button (three lines, top right) and choose **Add-ons and themes**.
2. Click the small gear icon near the top.
3. Choose **Install Add-on From File…**
4. Pick the `.xpi` file you just downloaded and click **Add** when it asks.

If the temporary copy is still loaded, remove it first from `about:debugging` so you don't get two icons.

## User
ok doing it

## Assistant
Take your time. If anything on those pages looks different from what I described, tell me the exact words on the button or the message and I'll tell you what to click. If the check fails with an error, paste the message here and I'll fix the file and give you a new zip.

## User
installed. restarted firefox, still there and youtube is empty. works

## Assistant
That's the result we wanted. The signed Quiet add-on survived the restart, the homepage recommendations and Shorts are hidden, and the comments are untouched.

To use it:

- Click the toolbar icon for a break. Quiet is off for 20 minutes, then it comes on by itself.
- Click again during a break to end it early.

Everything is saved in `/Users/user/Documents/quiet-youtube`. If YouTube changes its layout and something shows up again, tell me what you see and I'll update `hide.css`. You'd then upload a new zip the same way. Make sure the `version` number in `manifest.json` is higher than before, or the signing step will refuse it. I can bump it for you when that happens.
