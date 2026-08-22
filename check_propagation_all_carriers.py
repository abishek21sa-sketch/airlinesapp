import requests

API_BASE = "http://127.0.0.1:8000"

CARRIERS = {
    "AA": "American Airlines",
    "DL": "Delta Air Lines",
    "UA": "United Airlines",
    "WN": "Southwest Airlines",
    "AS": "Alaska Airlines",
    "B6": "JetBlue Airways",
    "NK": "Spirit Airlines",
    "F9": "Frontier Airlines",
    "G4": "Allegiant Air",
    "HA": "Hawaiian Airlines",
    "VX": "Virgin America",
}

rows = []
for code, name in CARRIERS.items():
    try:
        r = requests.get(f"{API_BASE}/api/delay-propagation", params={"carrier": code}, timeout=60)
        r.raise_for_status()
        data = r.json()
        strata = {s["label"]: s["correlation"] for s in data["turnaround_strata"]}
        tight = next(v for k, v in strata.items() if k.startswith("Tight"))
        normal = next(v for k, v in strata.items() if k.startswith("Normal"))
        loose = next(v for k, v in strata.items() if k.startswith("Loose"))
        rows.append((code, name, data["pairs"], data["correlation"], tight, normal, loose))
    except Exception as e:
        rows.append((code, name, None, None, None, None, f"ERROR: {e}"))

print(f"{'Code':<5}{'Carrier':<22}{'Pairs':>12}  {'Overall':>8}  {'Tight':>8}  {'Normal':>8}  {'Loose':>8}")
for code, name, pairs, overall, tight, normal, loose in rows:
    if pairs is None:
        print(f"{code:<5}{name:<22}  {loose}")
        continue
    print(f"{code:<5}{name:<22}{pairs:>12,}  {overall:>8.3f}  {tight:>8.3f}  {normal:>8.3f}  {loose:>8.3f}")