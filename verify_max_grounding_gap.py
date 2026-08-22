"""
Sanity-checks grounded_737_max_aircraft.csv against your actual warehouse
flight data, before building any real analysis on top of it.

What it checks:
1. How many of these 72 tail numbers actually appear in your warehouse at
   all (a tail with zero matches might mean it never flew for one of your
   11 tracked marketing carriers -- worth knowing, not necessarily a bug).
2. Monthly flight counts across all matched tails, so you can see by eye
   whether there's a real gap starting ~March 2019 (grounding) and a
   resumption starting ~Dec 2020 (ungrounding) -- if the gap isn't there,
   something's wrong with the tail-number join before we go any further.

BEFORE RUNNING: put grounded_737_max_aircraft.csv in the same folder as
this script, or edit CSV_PATH below. Uses the same DUCKDB_PATH pattern as
your earlier DESCRIBE check.
"""

import csv
import duckdb

CSV_PATH = "grounded_737_max_aircraft.csv"
DUCKDB_PATH = "Data/Warehouse/airline.duckdb"


def main():
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    tails = [r["tail_number"].strip().upper() for r in rows]
    print(f"Loaded {len(tails)} tail numbers from {CSV_PATH}")

    con = duckdb.connect(DUCKDB_PATH, read_only=True)

    placeholders = ",".join(["?"] * len(tails))

    matched = con.execute(
        f"SELECT COUNT(DISTINCT Tail_Number) FROM flights WHERE Tail_Number IN ({placeholders})",
        tails,
    ).fetchone()[0]
    print(f"\n{matched} of {len(tails)} tail numbers appear in your warehouse at all.")

    monthly = con.execute(
        f"""
        SELECT
            strftime(FlightDate, '%Y-%m') AS month,
            COUNT(*) AS flights,
            COUNT(DISTINCT Tail_Number) AS distinct_tails
        FROM flights
        WHERE Tail_Number IN ({placeholders})
        GROUP BY strftime(FlightDate, '%Y-%m')
        ORDER BY month
        """,
        tails,
    ).fetchall()

    print(f"\n{'Month':<10}{'Flights':>10}{'Distinct tails':>16}")

    def next_month(ym: str) -> str:
        year, month = int(ym[:4]), int(ym[5:7])
        return f"{year+1}-01" if month == 12 else f"{year}-{month+1:02d}"

    prev_month = None
    for month, flights, distinct_tails in monthly:
        if prev_month is not None and next_month(prev_month) != month:
            gap_start = next_month(prev_month)
            print(f"  ... GAP: no flights at all from {gap_start} up to (not including) {month} ...")
        print(f"{month:<10}{flights:>10,}{distinct_tails:>16}")
        prev_month = month

    con.close()


if __name__ == "__main__":
    main()