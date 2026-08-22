# Fresh Setup + Full Testing Guide

Written for Windows + PowerShell + VS Code, starting from nothing. Follow
Part 1 top to bottom once. Part 2 is the actual test plan, ordered by
priority -- do it in order, stop and tell me immediately if anything in
Tier 0 fails, since everything after it depends on those basics working.

---

## PART 1 — Fresh setup, step by step

### Step 1: Get the code into place

Your real data (`Data\Warehouse\airline.duckdb`) is NOT in this zip -- it's
too large to ship this way. If you already have a project folder with that
file in it, extract this zip's `zero_start` folder contents INTO that same
folder, letting them merge -- do not delete your existing `Data\` folder.

If this is genuinely a brand new folder, extract the zip, then copy your
real `Data\Warehouse\airline.duckdb` into `<project>\Data\Warehouse\` before
continuing -- nothing that touches real data will work without it.

Open the project folder in VS Code:
```powershell
code "C:\path\to\your\AirlinesApp"
```

Open a terminal inside VS Code (`` Ctrl+` ``) -- it should default to
PowerShell. All commands below run from the project root unless noted.

### Step 2: Python backend environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

If PowerShell blocks that second command with a script-execution error
(a common, expected Windows default), run this once, then retry:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

With the venv active (you'll see `(.venv)` in the prompt):
```powershell
pip install -r requirements.txt
```

This now includes `scipy` (needed for the new OR features) and `pytest`
(needed to actually run the test suite) -- both were genuinely missing
from this file before tonight; fixed as part of this round, confirmed by
reading the file, not assumed.

### Step 3: Environment variables

```powershell
Copy-Item .env.example .env
```

Open `.env` and set your real `ANTHROPIC_API_KEY`. Everything else in
there has sensible local-dev defaults already.

### Step 4: Confirm the backend can actually see your data

```powershell
python scripts\check_deployment_readiness.py
```

This should report your real `airline.duckdb` file size. If it says the
file isn't found, fix the path (either move the file to the default
location it reports, or set `AIRLINE_DUCKDB_PATH` in `.env` to wherever it
actually lives) before going further.

### Step 5: Start the backend

```powershell
uvicorn api.main:app --reload
```

Leave this running. Open a **second** terminal (`` Ctrl+Shift+` ``) for
everything below.

### Step 6: Frontend setup

```powershell
cd frontend
Copy-Item .env.local.example .env.local
npm install
```

`.env.local` already defaults to `http://127.0.0.1:8000`, matching the
backend from Step 5 -- no edit needed for local testing.

### Step 7: Start the frontend

```powershell
npm run dev
```

Visit `http://localhost:3000`. If this loads, both servers are up and
Part 2 can begin.

---

## PART 2 — Testing plan, in priority order

### Tier 0 — Does it actually run (stop and tell me if anything here fails)

**Backend started cleanly** (Step 5) -- no import errors in that terminal.

**Frontend started cleanly** (Step 7) -- no errors, page loads.

**Real automated build checks** -- these are things I could never actually
run myself (no network access in my environment):
```powershell
cd frontend
npm run typecheck
npm run build
```
Both should complete with no errors. This is the first genuine `tsc` and
`next build` this code has ever been checked against -- everything I
verified on my end was bracket-matching, not a real compile.

**The real pytest suite** -- also something I could never actually run:
```powershell
cd ..
pytest tests\ -v
```
Expect **29 tests**, all passing. I verified every one of these by running
the underlying logic directly in my own environment (no `pytest` installed
there), so this is the first time they'll run through the real `pytest`
CLI. If anything fails here that I reported as passing, that's a real,
important discrepancy -- tell me exactly which test and the error.

### Tier 1 — This sprint's work (newest, least tested, highest priority)

**The on-time-rate fix (32 sites).** Pick any carrier or airport profile
page, note the on-time rate shown. This should now correctly exclude
cancelled flights from the calculation -- if you want to sanity check by
hand, ask Copilot "what's the cancellation rate for [carrier]" and
"what's the on-time rate for [carrier]" for the same scope, then reason
about whether the on-time number looks like it's excluding cancellations
(it should be somewhat higher than before this fix, especially for
carriers/periods with more cancellations).

**The OR features -- no UI yet, so test via Python directly:**
```powershell
python -c "
from api.optimization.departure_bank import BankFlight, solve_departure_bank
flights = [BankFlight(flight_id=f'F{i}', original_bucket=32) for i in range(14)]
limit = {t: 5.0 for t in range(96)}
weight = {t: 1.0 for t in range(96)}
point_est = {t: 10.0 for t in range(96)}
r = solve_departure_bank(flights, 96, 30, limit, weight, point_est, mode='expected')
print('status:', r.status)
print('peak load:', r.original_peak_load, '->', r.optimized_peak_load)
"
```
Expect status `optimal` and the peak load genuinely dropping. This proves
the real HiGHS solver (via scipy) works end to end on your machine, not
just mine.

**The predictive risk model upgrade.** Decision Center → Predictive Risk
Screen tab → run it for any carrier or airport. Check the "what's driving
this" section — you should now sometimes see "Recent trend" or "Seasonal
pattern" listed among the top 3 drivers, not just the original six
features. If neither ever appears across several entities, that's worth
flagging — it might mean the signal is genuinely weak, or it might mean
something's not wired correctly.

### Tier 2 — Broader recent work (should still work, quick pass)

- Toggle Public/Researcher mode in the nav — confirm 737 MAX, Decision
  Center, and Methodology appear/disappear correctly
- Visit a carrier profile in both modes — Public should be compact,
  Researcher should show the 4-tab layout
- Try a Quick Lookup with a specific date range, click through to the full
  profile — confirm the range carries over and lands you in Researcher mode
- Compare page — all 4 tabs (Carrier/Airport/Route/Aircraft)
- Copilot — ask a question in both modes, confirm the mode indicator and
  response quality genuinely differ

### Tier 3 — Deployment scaffolding (optional, only if you want to go there tonight)

```powershell
docker build -t airlines-app-test .
```
This is something I could never test myself (no Docker, no network) — if
it builds successfully, that's genuinely new information neither of us
had before.

---

## If something fails

Tell me: which tier, which specific step, and the exact error text or
screenshot. Given how much of tonight's work I could only verify indirectly
(no pytest, no scipy confirmed installed, no real browser, no Docker), a
real failure here is valuable, specific information — not a sign
everything else is suspect.
