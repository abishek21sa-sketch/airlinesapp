import duckdb

con = duckdb.connect("Data/Warehouse/airline.duckdb", read_only=True)
cols = con.execute("DESCRIBE flights").fetchall()
print(f"Total columns: {len(cols)}\n")
for name, dtype, *_ in cols:
    print(f"{name:<35}{dtype}")