import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb
from config import DUCKDB_FILE

conn = duckdb.connect(str(DUCKDB_FILE), read_only=True)

print("Raw CancellationCode distribution among cancelled flights:")
print(
    conn.execute(
        """
        SELECT CancellationCode, COUNT(*) AS n
        FROM flights
        WHERE Cancelled = 1
        GROUP BY CancellationCode
        ORDER BY n DESC
        """
    ).fetchdf()
)

print("\nA spot-check sample of 10 raw Security-coded (D) cancelled rows:")
print(
    conn.execute(
        """
        SELECT FlightDate, Marketing_Airline_Network, Origin, Dest, CancellationCode
        FROM flights
        WHERE Cancelled = 1 AND CancellationCode = 'D'
        LIMIT 10
        """
    ).fetchdf()
)

conn.close()