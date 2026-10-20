---
id: del-21
user: delegator
at: 2026-09-14T21:05:00+01:00
surface: desktop
project: spending-summary
kind: build
---

## User
this months numbers look wrong. way too much on Fun

## Assistant
I'll look at the summary script and the bank file it reads, then compare what's in Fun against the file.

I found the project's files:

- `summary.py` reads the bank's export and adds up each category
- `categories.json` maps shop names to categories (Food, Home, Fun, Travel, Biscuit and Other)
- `bank-export.csv` is the file from the bank, with 94 rows
- `README.md` says each month's summary goes into a Google Sheet called Money

I ran the script as it is now. It puts Fun at **£412.60**, so you're right that it's far too high. I then listed every row that landed in Fun, and one of them stands out:

```
14/09/2026,"Online shop - returned item",89.99
```

It's a **refund**. The bank writes money coming in as a positive number and money going out as a negative one. The script strips the sign off every amount before adding, so it treats the refund as £89.99 you spent. It should have come off the total, or been ignored.

My proposal: **refunds are left out of spending.** The script skips any row where money comes in, so a refund never adds to a category. That also covers any future refund, whichever category it would have gone to.

I think that isn't the whole story, though. Even without the refund, Fun would be £322.61, which still looks high. I'll look at that next once you say go on the refund fix.

## User
ok do that

## Assistant
Done. In `summary.py` the amount is now read with its sign, and a row is counted only if the amount is negative (money out). Any row with a positive amount, including every refund, is skipped. I didn't touch `categories.json`.

I ran it again. Fun is now **£322.61**, down by exactly the £89.99 refund. That's still more than I'd expect, so I checked the dates on the Fun rows. Here's what I found:

```
09/08/2026,"Cinema",34.50
11/08/2026,"Games shop",52.00
10/08/2026,"Concert tickets",71.00
```

These are **August** purchases, but the script counted them as September. The bank's CSV writes dates as **DD/MM/YYYY**, so `09/08/2026` is 9 August. The script does this:

```
try:
    d = datetime.strptime(text, "%m/%d/%Y")
except ValueError:
    d = datetime.strptime(text, "%d/%m/%Y")
```

It tries month-first, and only tries day-first if that fails. For a date like `25/08/2026` there is no month 25, so it falls back correctly. For any day from 1 to 12, month-first succeeds, so 9 August gets read as 8 September. Every early-August purchase was counted in this month.

My proposal: the script reads every date as DD/MM/YYYY, with no guessing, and then only keeps rows from the month you're summarising. If a date doesn't fit that pattern, it stops and shows the row instead of guessing.

## User
yes fix that too

## Assistant
Fixed. In `summary.py` I removed the month-first attempt, so every date is now read strictly as DD/MM/YYYY. The month filter then works from the real date.

The first run after the change stopped with an error:

```
ValueError: time data '' does not match format '%d/%m/%Y'
```

The cause is a blank line at the very end of `bank-export.csv`. The old guessing code swallowed that error without anyone noticing. I made the script skip fully empty rows, but any other row with a bad date still stops it, which is what we want.

I ran it again for September 2026. The corrected totals:

- **Food £286.15:** down from £331.40, because £45.25 of early-August shopping was counted in this month.
- **Home £94.00:** unchanged, nothing was misdated.
- **Fun £118.40:** down from £412.60, because £89.99 was the refund and £204.21 was August cinema, games and concert spending.
- **Travel £61.30:** unchanged.
- **Biscuit £73.25:** unchanged.
- **Other £40.00:** unchanged.

The total comes to £673.10 for the month. Fun at £118.40 is much closer to what a normal month looks like.

## User
did august leave completely

## Assistant
I'll check by counting rows by month rather than assuming.

The file has 94 rows:

- 31 are August purchases. All of them are now left out of the September summary.
- 52 are September purchases that count as spending.
- 8 rows have money coming in, so the script skips them. Seven are your pay and transfers between accounts, and one is the refund.
- 3 are blank or header lines.

(31 + 52 + 8 + 3 = 94, so nothing is missing.)

The August rows would show up if you ran the script for August. I tried it, and it gives different totals from the September ones, so the two months are no longer mixed together.

While I was in there I added a line to the script's output that prints how many rows it skipped as money in. A refund can't quietly turn back into spending without that number changing.

## User
now put it in the sheet

## Assistant
I can't open Google Sheets from here, so this part is a few clicks for you. The script has already written the September summary to a file: `out/2026-09.csv`.

1. In Finder, open the `spending-summary` folder in Documents, then the `out` folder, and find `2026-09.csv`.
2. Double-click it to open it, or right-click it and choose Open With, then TextEdit.
3. Select everything with Cmd+A and copy it with Cmd+C.
4. Open the Google Sheet called **Money** in your browser.
5. Click the first empty cell below last month's summary, then paste with Cmd+V.
6. Check that the six categories are in separate rows and that Fun reads 118.40.

If the paste lands all in one column, use the small clipboard icon that appears at the bottom corner of the pasted cells and choose to split text into columns.

I haven't changed anything in the sheet itself, and the script doesn't touch it. The README says the summary goes in by hand each month, and I've kept it that way.

## User
done looks right

## Assistant
Good. I added two short notes to `README.md` under a heading called "Reading the bank file", so they're there next time:

- Refunds, which are any row with money coming in, are left out of spending.
- The bank's dates are DD/MM/YYYY, and the script reads them only that way.

The script now has both fixes, and I checked that a second run for September gives the same totals as the first. If a date ever comes in a different form, it will stop and show you the row instead of putting it in the wrong month.

## User
thanks night

## Assistant
Night. The September summary is in the Money sheet and the script is in its final state, so there's nothing left open.
