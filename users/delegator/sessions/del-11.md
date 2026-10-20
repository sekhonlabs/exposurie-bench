---
id: del-11
user: delegator
at: 2026-08-02T19:45:00+01:00
surface: desktop
project: spending-summary
kind: build
---

## User

want my spending totals on my iPhone

## Assistant

I'll take a quick look at how the project produces the totals now.

I've looked through `/Users/user/Documents/spending-summary`. Here is what it does today:

- `expenses.csv` holds the raw rows.
- `summarise.py` reads that file and adds up each month by category: Food, Home, Fun, Travel, Biscuit and Other.
- The result is printed in the terminal and saved as `monthly_totals.csv`.

So the totals only exist on this Mac. One question before I pick a way to get them onto your phone: is there an app on your iPhone where you already look at numbers or lists?

## User

i check Sheets on it already

## Assistant

Then that's what I'll use. Each month's summary will go into a Google Sheet called Money, because you already check Sheets on your phone. Nothing new to install, and the totals will be there whenever you open the app.

Here is the plan:

1. You make an empty Google Sheet called Money. It takes about a minute.
2. I write a small receiver script that you paste into that Sheet. It adds one row per month: the month, then Food, Home, Fun, Travel, Biscuit, Other, and a Total.
3. I change `summarise.py` so that after it adds up a month, it sends that row to your Sheet. It still only uses Python's built-in tools, so there is nothing to install.
4. You click through a one-time permission screen so the Sheet accepts the rows.

The same month sent twice will update its existing row, not add a second one.

Shall I go ahead with the code part now?

## User

ok do that

## Assistant

Done. While testing, I hit one small problem and fixed it:

```
ValueError: could not convert string to float: ''
```

This came from an empty line at the very bottom of `expenses.csv`. The old script crashed on it, but only when it reached that line. I made `summarise.py` skip rows with no amount, so it won't trip on that again.

What I changed:

- **`summarise.py`**: after the totals are worked out, a new `send_to_sheet()` function posts the month's row to your Sheet. If the address file is missing, it prints a clear message and carries on, so the normal terminal output still works.
- **`sheet_receiver.js`** (new): the script you paste into the Sheet. It looks for a tab named Money and adds or updates the month's row. If the header row is missing, it creates it.
- **`sheet_url.txt`** (new, empty): where you'll paste the web address from step 6 below. Keeping it in its own file means the address never sits inside the code.

Now your part. Do this on the Mac, in a browser:

1. Create a new blank Google Sheet.
2. Click the title at top left (it says "Untitled spreadsheet") and rename it to **Money**.
3. Look at the tab at the bottom left. Double-click it and rename that to **Money** as well.
4. In the top menu click **Extensions**, then the script editor option.
5. Delete whatever is in the editor. Open `sheet_receiver.js` from the project folder, select everything in it, copy it, and paste it into the editor. Click the disk icon to save.
6. Click **Deploy** (top right), then **New deployment**. Click the small gear and choose **Web app**. Set "Who has access" to **Anyone**, then click **Deploy**.

A permission window will pop up at that point. Tell me what it says, or send me a description of it, and I'll walk you through it. Once it's done, copy the web address it shows and paste it into `sheet_url.txt`.

## User

it says needs permission

## Assistant

That's the one-time permission I mentioned. It's normal: the Sheet is asking if its own script may edit the Sheet. Click through like this:

1. Click **Authorize access**.
2. Pick your own Google account in the list that appears.
3. You'll probably see a warning saying Google hasn't verified this app. This is expected, because you wrote the script yourself and it hasn't been through any review. Click **Advanced** in the small grey text at the bottom left.
4. Click the link at the bottom that starts with **Go to** and ends with "(unsafe)".
5. Click **Allow**.
6. The deployment window comes back with a **Web app** address that starts with `https://`. Click **Copy** next to it.
7. Back on the Mac, open `sheet_url.txt` in the project folder, paste the address on the first line, and save.

You only do this once. Later runs won't ask again.

When that's saved, tell me and I'll run July through to check that it works.

## User

ok saved it

## Assistant

I ran `python3 summarise.py` for July, and it worked. The terminal printed the usual totals, then:

```
Sent July to the Sheet: ok
```

I also ran it a second time on purpose, and the Money tab still has one July row, not two. So the update-instead-of-add behaviour works.

The row has the month, then Food, Home, Fun, Travel, Biscuit, Other, and a Total at the end.

To see it on your iPhone:

1. Open the Sheets app.
2. Tap **Money** in your recent files. If it isn't there, tap the **Browse** or **Files** area at the bottom and look for it.
3. Tap the **Money** tab at the bottom if it isn't already showing.

If the columns look cramped on the small screen, turn the phone sideways. You can also pinch to zoom.

From now on, every time you run `summarise.py` for a new month, that month's row will appear in Money on its own. Nothing else for you to do.

## User

looks bad on phone, cramped

## Assistant

Fair. I'll fix that in the Sheet, not in the code, so it holds for every month.

I changed the receiver script so that when it creates the header row, it also:

- makes the header row bold,
- freezes the top row and the Month column, so they stay in place while you scroll sideways,
- sets every column to a width that fits the numbers without wasted space,
- rounds all amounts to two decimals.

Two steps are needed from you, because the Sheet holds its own copy of the script:

1. Open `sheet_receiver.js` in the project folder, select all, and copy.
2. Open the Money Sheet on the Mac, click **Extensions**, then the script editor option. Select everything in the editor, paste over it, and click the disk icon to save.
3. Click **Deploy**, then **Manage deployments**. Click the pencil icon, change **Version** to **New version**, and click **Deploy**.

The web address stays the same, so `sheet_url.txt` doesn't need touching and there's no permission screen this time.

Then run `python3 summarise.py` once more. The row will update and the new layout will apply. Pull down on the Money tab in the phone app to refresh it, and tell me if it still looks cramped.
