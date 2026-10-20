---
id: del-16
user: delegator
at: 2026-08-23T20:00:00+01:00
surface: desktop
project: book-club
kind: distractor
---

## User

club page shows an error instead of the members. says "Couldn't find column: Joined"

## Assistant

I'll look at the script that feeds the page.

Found it. In `/Users/user/Documents/book-club/apps-script/Code.gs`, the function `getMembers()` reads the top row of your Google Sheet and expects a column headed exactly `Joined`. If it doesn't find that, it stops, and the page shows the error you're seeing instead of the nine members of Second Chapter.

So the sheet's heading for that column must be different now. What does it say at the top of that column?

## User

Date joined. i renamed it

## Assistant

That explains it. The script was matching one exact heading, so any rename broke it.

I've changed `getMembers()` in `apps-script/Code.gs` so it no longer cares about exact headings or column order:

- It reads the top row of the sheet and finds each column by the text of its heading.
- It ignores capital letters and stray spaces, so `Date joined`, `date joined ` and `DATE JOINED` all work.
- For the joined column it accepts either `Joined` or `Date joined`. The name and email columns work the same way, with a couple of likely spellings each.
- If a column is genuinely missing, the error now says which heading it wanted and lists the headings it found. Before, it only named the one it wanted, which is why you had to guess.

I also fixed one small thing on the way. A blank row at the bottom of the sheet used to turn up as an empty member, and now it's skipped.

I changed the file on your Mac, but the page runs from the copy inside Apps Script, so that copy needs updating. Here's what to click:

1. Open `apps-script/Code.gs` in the project folder and select everything in it (Cmd+A), then copy (Cmd+C).
2. Open your member Google Sheet.
3. In the top menu, click **Extensions**, then **Apps Script**.
4. In the left column, click **Code.gs**.
5. Click inside the code, press Cmd+A, then Cmd+V to paste over the old code.
6. Press Cmd+S to save.
7. At the top right, click the blue **Deploy** button, then **Manage deployments**.
8. Click the pencil icon next to your web app.
9. Under **Version**, choose **New version**.
10. Click **Deploy**, then **Done**.

The link stays the same, so nobody needs a new one. Reload the club page and tell me what you see.

## User

did it. still error

## Assistant

Same message as before, or a different one? That tells me which step to look at.

While you check, I looked at the file again to make sure the fix itself is sound. I found nothing wrong with it. The usual cause is step 9 being skipped, because saving alone doesn't change what the live page runs. It only changes the draft.

Here's a quick way to check:

1. In the Apps Script tab, click **Deploy**, then **Manage deployments**.
2. Look at the line under your web app that says **Version**.
3. If it says a lower number than you'd expect, or it has no "New version" note, click the pencil icon.
4. Under **Version**, choose **New version**, then click **Deploy**.

Then reload the club page. Do a hard reload with Cmd+Shift+R so the page doesn't show an old copy.

## User

ah i hit save but not deploy. doing it now

## Assistant

That's the one. Saving only changes the draft, and the live page keeps running the last deployed version until you deploy a new one.

When you've deployed, reload with Cmd+Shift+R. You should see all nine members, each with the date they joined. If the dates show up in the wrong format or as a long string of numbers, tell me and I'll fix it. I didn't change how dates are shown, so I expect them to look as they did before.

## User

works now. all 9 there

## Assistant

Good, the page is back to normal.

Here's what's different now, so the next rename doesn't catch you out:

- **Renaming is safe** as long as the heading still contains the same words. `Joined`, `Date joined` and `date joined` all work.
- **Moving columns is safe.** The script finds each one by its heading, so the order in the sheet doesn't matter.
- **Rewording completely is not safe.** If you rename `Date joined` to something like `Member since`, the script won't recognise it. The page would then show an error that lists the headings it found, so you'd see straight away what to change.
- **Adding columns is safe.** The script ignores any column it doesn't need.

Changes to the sheet's contents show up on the page straight away. Only changes to the script need the deploy steps.

I haven't changed anything else in the project. The shared link and the four-digit club code work as before.

## User

can i rename other columns too

## Assistant

Yes, with the same rule. Keep the key words in the heading and the script will find it. Capital letters and extra spaces don't matter.

These are the words each column needs:

- **Name**: the heading must contain `name`, so `Name` or `Full name` is fine.
- **Email**: the heading must contain `email`, so `Email` or `Email address` is fine.
- **Joined**: the heading must contain `joined`, so `Joined` or `Date joined` is fine.

Anything else is yours to rename, move or add without touching the script.

If you do reword one of these completely, the page will show an error that lists the headings it did find. Send me that message and I'll add your wording in a minute. You'd then do the same ten clicks as before, ending with **New version** and **Deploy**.

## User

ok thanks

## Assistant

You're welcome. The page is fixed and the code is saved in `apps-script/Code.gs`.
