import duckdb

import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0, str(_Path(__file__).resolve().parent.parent))

from config import DUCKDB_FILE


def main() -> None:
    print("=" * 60)
    print("VALIDATING DUCKDB WAREHOUSE")
    print("=" * 60)

    connection = duckdb.connect(str(DUCKDB_FILE), read_only=True)

    try:
        row_count = connection.execute(
            "SELECT COUNT(*) FROM flights"
        ).fetchone()[0]

        column_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_name = 'flights'
            """
        ).fetchone()[0]

        date_range = connection.execute(
            """
            SELECT
                MIN(FlightDate),
                MAX(FlightDate)
            FROM flights
            """
        ).fetchone()

        carrier_count = connection.execute(
            """
            SELECT COUNT(DISTINCT Marketing_Airline_Network)
            FROM flights
            WHERE Marketing_Airline_Network IS NOT NULL
            """
        ).fetchone()[0]

        month_count = connection.execute(
            """
            SELECT COUNT(
                DISTINCT STRFTIME(FlightDate, '%Y-%m')
            )
            FROM flights
            WHERE FlightDate IS NOT NULL
            """
        ).fetchone()[0]

        tail_count = connection.execute(
            """
            SELECT COUNT(DISTINCT Tail_Number)
            FROM flights
            WHERE Tail_Number IS NOT NULL
            """
        ).fetchone()[0]

        cancellation_count = connection.execute(
            """
            SELECT SUM(Cancelled)
            FROM flights
            """
        ).fetchone()[0]

        diversion_count = connection.execute(
            """
            SELECT SUM(Diverted)
            FROM flights
            """
        ).fetchone()[0]

        print(f"Rows              : {row_count:,}")
        print(f"Columns           : {column_count}")
        print(f"Date range        : {date_range[0]} to {date_range[1]}")
        print(f"Year-month periods: {month_count}")
        print(f"Unique carriers   : {carrier_count}")
        print(f"Unique tail nums  : {tail_count:,}")
        print(f"Cancelled flights : {int(cancellation_count):,}")
        print(f"Diverted flights  : {int(diversion_count):,}")

        print("\nTop 10 carriers:")
        carriers = connection.execute(
            """
            SELECT
                Marketing_Airline_Network,
                COUNT(*) AS flights
            FROM flights
            WHERE Marketing_Airline_Network IS NOT NULL
            GROUP BY Marketing_Airline_Network
            ORDER BY flights DESC
            LIMIT 10
            """
        ).fetchall()

        for carrier, flights in carriers:
            print(f"  {carrier:<5} {flights:>10,}")

        print("\nWarehouse validation passed.")

    finally:
        connection.close()


if __name__ == "__main__":
    main()