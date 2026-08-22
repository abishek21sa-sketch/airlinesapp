from pathlib import Path

import duckdb

import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0, str(_Path(__file__).resolve().parent.parent))

from config import CLEAN_DIR, DUCKDB_FILE


def main() -> None:
    print("=" * 60)
    print("BUILDING DUCKDB WAREHOUSE")
    print("=" * 60)

    clean_pattern = str(CLEAN_DIR / "OTP_*.csv")

    print(f"Source files : {clean_pattern}")
    print(f"Database     : {DUCKDB_FILE}")

    connection = duckdb.connect(str(DUCKDB_FILE))

    try:
        connection.execute("DROP TABLE IF EXISTS flights")

        connection.execute(
            """
            CREATE TABLE flights AS
            SELECT *
            FROM read_csv_auto(
                ?,
                union_by_name = true,
                header = true
            )
            """,
            [clean_pattern],
        )

        row_count = connection.execute(
            "SELECT COUNT(*) FROM flights"
        ).fetchone()[0]

        column_count = len(
            connection.execute("DESCRIBE flights").fetchall()
        )

        print(f"Rows loaded  : {row_count:,}")
        print(f"Columns      : {column_count}")
        print("Warehouse build complete.")

    finally:
        connection.close()


if __name__ == "__main__":
    main()