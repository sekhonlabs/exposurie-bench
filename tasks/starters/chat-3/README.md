# Spending summary

Adds up a month of spending from the bank's CSV file, by category: Food, Home, Fun, Travel, Biscuit and Other.

## Each month

1. Download the bank's CSV file and save it in this folder as `bank-export.csv`.
2. Run `python3 summary.py bank-export.csv 2026-09`, with the month you want.
3. Open `out/2026-09.csv`, copy everything, and paste it into the Google Sheet called Money, below last month's.

Shop names are matched to categories in `categories.json`. Anything that doesn't match goes in Other.

## Reading the bank file

- Refunds, and any other row with money coming in, are left out of spending.
- The bank's dates are DD/MM/YYYY, and the script reads them only that way. If a date comes in another form, it stops and shows the row.
