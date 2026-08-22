import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb
from config import DUCKDB_FILE

conn = duckdb.connect(str(DUCKDB_FILE), read_only=True)

print("Security (D) share of each carrier's OWN cancellations:")
print(
    conn.execute(
        """
        SELECT
            Marketing_Airline_Network AS carrier,
            COUNT(*) AS total_cancelled,
            SUM(CASE WHEN CancellationCode = 'D' THEN 1 ELSE 0 END) AS security_cancelled,
            ROUND(100.0 * SUM(CASE WHEN CancellationCode = 'D' THEN 1 ELSE 0 END) / COUNT(*), 1) AS security_pct
        FROM flights
        WHERE Cancelled = 1 AND Marketing_Airline_Network IS NOT NULL
        GROUP BY carrier
        ORDER BY security_pct DESC
        """
    ).fetchdf()
)

print("\nSecurity (D) cancellations by year (is it concentrated in specific years?):")
print(
    conn.execute(
        """
        SELECT
            EXTRACT(YEAR FROM FlightDate) AS year,
            COUNT(*) AS total_cancelled,
            SUM(CASE WHEN CancellationCode = 'D' THEN 1 ELSE 0 END) AS security_cancelled,
            ROUND(100.0 * SUM(CASE WHEN CancellationCode = 'D' THEN 1 ELSE 0 END) / COUNT(*), 1) AS security_pct
        FROM flights
        WHERE Cancelled = 1
        GROUP BY EXTRACT(YEAR FROM FlightDate)
        ORDER BY year
        """
    ).fetchdf()
)

conn.close()