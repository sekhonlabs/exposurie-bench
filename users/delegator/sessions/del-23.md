---
id: del-23
user: delegator
at: 2026-09-27T18:30:00+01:00
surface: desktop
project: quiet-youtube
kind: distractor
---

## User

quiet stopped working

## Assistant

I'll look at how the add-on is built and what YouTube's page looks like to its rules now.

I've found the cause. Quiet works by hiding parts of the YouTube page, and it finds those parts by their names in the page's code. YouTube changed how the homepage is built, so Quiet's rules no longer match anything and nothing gets hidden.

This is what I found in `/Users/user/Documents/quiet-youtube`:

- `content.css` holds the hiding rules. The one for the homepage recommendations points at an element name YouTube still has, but it is now just an empty outer frame. The video cards moved into new, differently named pieces inside it. Quiet hides the frame's old contents, and those are no longer there.
- The Shorts rule has the same problem. It looked for a shelf marked as Shorts, and YouTube now builds that row from different pieces with a different label.
- `hide.js` only re-runs the rules when the page changes. It's fine, but it was waiting for the old names too.
- The comments rule doesn't match any of the changed pieces, so comments are not part of this problem.

So the fix is to swap the old names for the new ones in `content.css` and `hide.js`. Nothing else in the add-on needs to change.

I'll do that now and make sure the comments are left alone.

## User

ok do that

## Assistant

Done. I changed three things:

1. **Homepage recommendations.** In `content.css` I replaced the old card rule with rules for the new card pieces, and I now hide the whole row they sit in, so no empty gaps are left. Here is the core of it:

```
ytd-browse[page-subtype="home"] ytd-rich-grid-renderer {
  display: none !important;
}
ytd-browse[page-subtype="home"] yt-lockup-view-model {
  display: none !important;
}
```

The first rule hides the grid on the homepage only, so other pages are untouched. The second catches the new cards if YouTube moves them out of the grid. I limited both to the homepage, because the same card pieces show up in the "up next" column beside a video, and Quiet shouldn't touch that.

2. **Shorts.** The old rule looked for the shelf's Shorts label. I replaced it with one that matches the new Shorts row and the Shorts entry in the left-hand menu. Both are hidden, as before.

3. **`hide.js`.** I updated the names it waits for, so Quiet still hides things when you move between pages without a full reload. Before, it would only have worked after refreshing.

I didn't touch the comments. Quiet still hides the homepage recommendations and Shorts, and not comments. I checked every new rule against the page's comments section and none of them reach it.

I also raised the version in `manifest.json` from 1.3.2 to 1.3.3. Firefox won't replace an installed add-on with a file that has the same version number.

I ran the project's signing step too. Quiet is signed as an unlisted add-on, so once installed it stays through Firefox restarts. The signed file is here:

`/Users/user/Documents/quiet-youtube/dist/quiet-1.3.3.xpi`

I haven't installed it in your Firefox. I can't click around in your browser, so that part is yours. I'll give you the steps whenever you want them.

## User

comments still stay right

## Assistant

Yes, they stay. I checked this on purpose, since it's the one thing Quiet must not break.

The new rules only match three kinds of thing: the homepage grid, the video cards on the homepage, and the Shorts row plus its menu entry. The comments section is built from different pieces, and none of the new rules point at those. The rule list in `content.css` has no line that mentions comments at all.

The toolbar button still works as before too. In `background.js` it turns Quiet off for 20 minutes, then switches it back on by itself. I didn't change that.

After you install it, a quick check takes about a minute:

1. Open the YouTube homepage. It should be empty, with no recommendations.
2. Look at the left-hand menu. There should be no Shorts entry.
3. Open any video and scroll down. The comments should be there.

If one of these is wrong, tell me which and I'll look at it.

## User

how do i install it

## Assistant

Here are the steps. You'll need Firefox open.

1. In Firefox, click the three-line menu in the top right corner.
2. Click **Add-ons and themes**. A tab opens with your add-ons listed.
3. Find **Quiet** in the list and click **Remove**. Confirm if it asks. This clears out the old version that no longer works.
4. Click the small **gear** icon near the top of the same page.
5. Click **Install Add-on From File…**
6. A file window opens. Go to your Documents folder, then `quiet-youtube`, then `dist`.
7. Click `quiet-1.3.3.xpi`, then click **Open**.
8. Firefox asks if you want to add Quiet. Click **Add**.
9. If it shows a box saying Quiet was added, click **OK**.

Then open YouTube and do the three checks from my last message. You don't have to restart Firefox. If you do restart it later, Quiet stays on, because the file is signed.

If step 8 says the add-on "could not be verified", stop and tell me what the message says word for word. That would mean the signing didn't go through, and I'd redo it.

## User

worked. thanks

## Assistant

Good, glad it's working again.

YouTube may change its page again at some point. If the recommendations come back, just open this folder and tell me Quiet stopped working, and I'll look at the rules the same way. The fix will probably again be a rename in `content.css` and `hide.js`, and a new file to install with the same steps.

For now Quiet hides the homepage recommendations and Shorts, leaves comments alone, and the toolbar button pauses it for 20 minutes when you need that.
