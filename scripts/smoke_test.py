#!/usr/bin/env python3
"""
Smoke test for the deployed (or locally `docker run`) backend. Deliberately
does NOT hit /api/copilot/chat -- that costs real Claude API money per call
and doesn't belong in an automatic check that might get run repeatedly.

Usage:
    python scripts/smoke_test.py http://127.0.0.1:8000        # local docker run
    python scripts/smoke_test.py https://your-app.onrender.com  # after deploying

Exit code 0 if everything checked passes, 1 otherwise.
"""

from __future__ import annotations

import sys
import time

import requests

# Windows' default console codepage (cp1252) can't encode the checkmark/
# cross characters below and crashes with UnicodeEncodeError before any
# output prints -- reconfigure stdout to UTF-8 so this runs from a fresh
# PowerShell/cmd window with no env var workaround needed.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ENDPOINTS = [
    ("/api/health", "Lightweight platform health check (should be near-instant)"),
    ("/api/data-health", "Data health / warehouse status (queries the full warehouse -- expect seconds, not ms)"),
    ("/api/carriers", "Carrier rankings"),
    ("/api/airports", "Airport rankings"),
    ("/api/routes", "Route rankings"),
    # Decision Center MILP/model endpoints -- the source of the real bugs
    # found and fixed this session (sampling bias, exponential recursion,
    # label leakage). Covering them here means a regression in any of them
    # shows up in a 10-second smoke test instead of only surfacing live.
    ("/api/decision/departure-bank-smoothing?airport=ORD", "Departure bank smoothing (ORD, defaults)"),
    ("/api/decision/network-protection-portfolio", "Network protection portfolio (default carrier/budget)"),
    ("/api/decision/predictive-risk?entity_type=carrier&entity=WN", "Predictive risk screen (Southwest)"),
]


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/smoke_test.py <base_url>")
        print("  e.g.: python scripts/smoke_test.py http://127.0.0.1:8000")
        return 1

    base_url = sys.argv[1].rstrip("/")
    print(f"Smoke testing: {base_url}\n")

    failures = 0
    for path, label in ENDPOINTS:
        url = f"{base_url}{path}"
        start = time.monotonic()
        try:
            response = requests.get(url, timeout=30)
            elapsed_ms = (time.monotonic() - start) * 1000
            if response.status_code == 200:
                body_preview = str(response.json())[:80]
                print(f"  \u2713 {label:<30} {path:<20} {elapsed_ms:>7.0f}ms  {body_preview}...")
            else:
                print(f"  \u2717 {label:<30} {path:<20} HTTP {response.status_code}")
                failures += 1
        except requests.RequestException as exc:
            print(f"  \u2717 {label:<30} {path:<20} FAILED: {exc}")
            failures += 1

    print()
    if failures:
        print(f"{failures} of {len(ENDPOINTS)} checks failed.")
        return 1
    print(f"All {len(ENDPOINTS)} checks passed.")
    print("\nNote: /api/copilot/chat was deliberately NOT tested here (costs real API")
    print("money per call) -- test that one manually, once, through the actual UI.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
