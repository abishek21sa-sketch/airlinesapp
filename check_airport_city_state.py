import duckdb

con = duckdb.connect("Data/Warehouse/airline.duckdb", read_only=True)
cols = set(r[0] for r in con.execute("DESCRIBE flights").fetchall())
need = ["OriginCityName", "OriginState", "OriginStateName", "DestCityName", "DestState", "DestStateName"]
print({c: (c in cols) for c in need})

# If present, show a sample so we can see the actual formatting
if "OriginCityName" in cols:
    print(con.execute(
        "SELECT DISTINCT Origin, OriginCityName, OriginState FROM flights "
        "WHERE Origin IN ('ORD','LAX','ATL','MDW') LIMIT 10"
    ).fetchall())