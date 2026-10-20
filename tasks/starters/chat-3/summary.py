"""Where did the money go? Adds up one month of the bank's CSV export by category.

    python3 summary.py bank-export.csv 2026-09

Prints the totals and writes them to out/2026-09.csv, ready to paste into the
Money sheet. Uses only what comes with Python, so there is nothing to install.
"""

import csv
import json
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
CATEGORIES = json.loads((HERE / "categories.json").read_text())
ORDER = ["Food", "Home", "Fun", "Travel", "Biscuit", "Other"]


def read_date(text):
    # The bank writes DD/MM/YYYY. Reading it any other way puts early-month
    # purchases in the wrong month, so a date that doesn't fit stops the run.
    try:
        return datetime.strptime(text.strip(), "%d/%m/%Y").date()
    except ValueError:
        sys.exit(f"Can't read the date {text!r}. Expected DD/MM/YYYY.")


def category_for(description):
    upper = description.upper()
    for category, words in CATEGORIES.items():
        if any(word in upper for word in words):
            return category
    return "Other"


def summarise(path, month):
    totals = {name: 0.0 for name in ORDER}
    money_in = 0
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if not (row.get("Amount") or "").strip():
                continue
            if read_date(row["Date"]).strftime("%Y-%m") != month:
                continue
            amount = float(row["Amount"].replace(",", ""))
            # Money in, refunds included, is never spending.
            if amount >= 0:
                money_in += 1
                continue
            totals[category_for(row["Description"])] += -amount
    return totals, money_in


def main():
    if len(sys.argv) != 3:
        sys.exit("Usage: python3 summary.py <bank file> <YYYY-MM>")
    path, month = sys.argv[1], sys.argv[2]
    totals, money_in = summarise(path, month)

    out = HERE / "out"
    out.mkdir(exist_ok=True)
    with open(out / f"{month}.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Category", month])
        for name in ORDER:
            writer.writerow([name, f"{totals[name]:.2f}"])
        writer.writerow(["Total", f"{sum(totals.values()):.2f}"])

    for name in ORDER:
        print(f"{name:<8} £{totals[name]:>9.2f}")
    print(f"{'Total':<8} £{sum(totals.values()):>9.2f}")
    print(f"Skipped {money_in} row(s) of money coming in.")
    print(f"Saved out/{month}.csv")


if __name__ == "__main__":
    main()
