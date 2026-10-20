---
id: del-10
user: delegator
at: 2026-07-27T21:30:00+01:00
surface: desktop
project: spending-summary
kind: build
---

## User

where does my money go

## Assistant

Let me look at what's in the folder first.

I found one file, `june-2026.csv`, and no other code. It looks like a download from your bank: 143 rows with the columns `Date`, `Description`, `Amount` and `Balance`. Spending is shown as negative numbers and money coming in as positive ones.

Here's what I'd like to do. I'll write one small script, `summarise.py`, that reads a bank file, sorts each row into a spending category and prints a total per category. A single script suits you better than a spreadsheet. A spreadsheet needs rebuilding or fixing by hand every month, whereas with a script you drop in the new file, run one command and read the answer.

I'll write it in Python using only the built-in csv module. That means there's nothing to install, so it will run on your Mac as it is. A tool like pandas would do the job too, but it's heavier than this needs: it's a big add-on you'd have to install and keep working, just to add up a few columns.

Is that okay?

## User

ok do that

## Assistant

Done. I created `/Users/user/Documents/spending-summary/summarise.py`. It does four things:

- opens the file you give it
- skips money coming in, so only spending gets counted
- looks for known words in each description, such as `GROCERS` or `CINEMA`, to decide the category
- adds up each category and prints the totals, biggest first

I ran it on `june-2026.csv` as a test. It works, and one thing needed a small fix along the way: the bank writes amounts like `-1,204.50` with a comma inside the number, which made the script stop with `ValueError: could not convert string to float`. It now strips the commas before reading the number.

Now the part that needs your say-so: the categories. I looked through the 143 descriptions and suggest these five:

- **Food**: groceries, takeaways, cafés
- **Home**: bills, household shop, repairs
- **Fun**: cinema, games, nights out, subscriptions
- **Travel**: trains, buses, fuel, taxis
- **Other**: anything that doesn't match the above

Anything the script doesn't recognise goes into Other, so no money disappears from the total. Shall I go with these?

## User

add one for my dog. biscuit. he costs a fortune

## Assistant

Good call, and the file backs you up. I can see several rows from a pet supplies shop, a vet practice and a dog groomer, and they were all sitting in Other.

I've added **Biscuit** as its own category, with its own list of words to look for: `PET`, `VET`, `PAWS`, `GROOM` and `KENNEL`. The list is now:

Food, Home, Fun, Travel, Biscuit and Other.

The script checks Biscuit before the others, so a row like "PET SUPPLIES" can't get filed under Home by mistake. Want me to run it on June now?

## User

yes run it

## Assistant

I ran it on `june-2026.csv`. All 143 rows were read. 119 of them are spending, and the rest are money coming in, which the script ignores.

```
Category    Total     Rows
Home        538.00     21
Food        412.60     38
Biscuit     186.40      9
Fun         143.25     17
Other        97.35     21
Travel       71.80     13
-------------------------
Spending   1449.40    119
```

What stands out:

- **Home** is the biggest, at £538.00, ahead of Food at £412.60.
- **Biscuit** comes to £186.40 over 9 payments. That's more than Fun, so your instinct about him was right. It's also a good reason to have given him his own line.
- **Other** is £97.35 across 21 rows. That's quite a lot of small things, so I checked what's in it. Most are cash withdrawals and a few card payments with unclear names, such as `SQ *KIOSK 4471`. I left them alone, because guessing at them would make the numbers look neater than they really are.

The total spent is £1,449.40, and the six lines add up to exactly that.

Do you want me to try to sort out the Other pile, or leave it?

## User

leave it

## Assistant

Left as it is. Other stays as the place for anything the script can't place.

Since you'll want this each month, I've also made the script save its result next to the bank file. When you run it on `june-2026.csv` it writes `june-2026-summary.txt` beside it, containing the same table you saw above. That way you can look at a past month without running anything again.

One small fix while I was in there: the table columns didn't line up when a total went over £1,000, so I widened the number column. It's now neat up to £99,999.99, which should be plenty.

I haven't touched your bank file. The script only reads it.

Shall I write out the steps for next month?

## User

yes how do i run it

## Assistant

Here are the steps for when July's file is ready, which will be early next month.

**Get the file**

1. Log in to your bank's website and find the page for downloading statements.
2. Choose the whole month, and pick **CSV** as the format.
3. Click download. The file will land in your Downloads folder.
4. Rename it to `july-2026.csv`. To do that, click the file once in Finder, press Return, type the new name and press Return again. The name isn't essential, but it keeps the summary files easy to tell apart.
5. Drag it into the `spending-summary` folder inside Documents.

**Run the script**

1. Press Command and Space together, type `Terminal` and press Return.
2. Type this and press Return:

```
cd ~/Documents/spending-summary
```

3. Then type this and press Return:

```
python3 summarise.py july-2026.csv
```

The table appears on screen straight away. A file called `july-2026-summary.txt` is saved in the same folder.

If you'd rather not use Terminal, you can also just open this folder in Claude Code and say "run it on july-2026.csv". That works the same way.

If the bank changes the column names one month, the script will stop with a message saying which column it can't find, rather than quietly printing wrong totals.

## User

looks bad the table

## Assistant

Fair enough. The plain table in Terminal is a bit cramped, with no space around it and the same weight for every line.

I've changed three things in `summarise.py`:

- Each category now has a share next to it, for example `Home 37%`, so you can see at a glance where the money goes without doing sums.
- There's a blank line above and below the table.
- The total line sits apart at the bottom, under a longer divider.

Run on June, it now looks like this:

```
Category    Total     Share   Rows
Home        538.00     37%     21
Food        412.60     28%     38
Biscuit     186.40     13%      9
Fun         143.25     10%     17
Other        97.35      7%     21
Travel       71.80      5%     13
-----------------------------------
Spending   1449.40    100%    119
```

The shares are rounded to whole numbers, so they can add up to 99% or 101% in some months. June happens to come to exactly 100%.

The saved `june-2026-summary.txt` was regenerated to match, and the commands for next month are unchanged.

## User

ok good

## Assistant

Good. To sum up what's in `/Users/user/Documents/spending-summary` now:

- `summarise.py`: the script, which uses only Python's built-in csv module, so there's nothing to install
- `june-2026.csv`: your bank file, untouched
- `june-2026-summary.txt`: June's table, saved

The categories are Food, Home, Fun, Travel, Biscuit and Other. If a new shop keeps landing in Other when it belongs somewhere else, tell me its name and which category it should go in, and I'll add it to the script.
