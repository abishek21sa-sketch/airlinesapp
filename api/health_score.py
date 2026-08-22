"""
Explainable health-score formula. Originally ported from the prior
platform's route_health.py (v1, hand-picked weights). The weights below
were later empirically calibrated: computed from 6,133 routes by splitting
each route's history chronologically (early ~70% / late ~30%), then
correlating each early-period component with that same route's ACTUAL
on-time rate in the later period. Weights are each component's correlation
with real future performance, normalized to sum to 1.0 -- not a guess.

Components (all 0-100):
- reliability: on-time percentage, as-is
- delay_severity: 100 - avg_arrival_delay * 2
- severe_delay_exposure: 100 - (% of flights delayed >60min) * 5
- cancellation_resilience: 100 - cancellation_pct * 10
- diversion_resilience: 100 - diversion_pct * 20

Weighted (calibrated against future on-time rate, n=6,133 routes):
  reliability              0.290  (r=+0.585 with future performance)
  delay_severity           0.251  (r=+0.507)
  severe_delay_exposure    0.275  (r=+0.556)
  cancellation_resilience  0.125  (r=+0.253)
  diversion_resilience     0.059  (r=+0.119)

Rating bands: >=90 Excellent, >=80 Strong, >=70 Watch, >=60 Weak, else Critical.
"""

from __future__ import annotations

from typing import Any

from api.db import open_readonly_connection

MINIMUM_FLIGHTS_FOR_FULL_CONFIDENCE = 30


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(value, maximum))


def _get_rating(score: float) -> str:
    if score >= 90:
        return "Excellent"
    if score >= 80:
        return "Strong"
    if score >= 70:
        return "Watch"
    if score >= 60:
        return "Weak"
    return "Critical"


#: The raw aggregate expressions behind every health-score component, in a
#: fixed column order. Shared by compute_health_score (one entity) and any
#: caller that wants ALL entities' stats from a single GROUP BY query instead
#: of one query per entity -- see score_from_row below and its use in
#: api/main.py's network-protection-portfolio endpoint, which previously
#: issued one full-table-scan query per candidate (N sequential scans over
#: 60.7M rows) instead of one grouped scan.
RAW_STAT_SELECT_EXPRS = """
    COUNT(*) AS total_flights,
    SUM(CASE WHEN Cancelled = 0 AND Diverted = 0 AND ArrDelay IS NOT NULL THEN 1 ELSE 0 END) AS completed_flights,
    AVG(CASE WHEN Cancelled = 0 AND Diverted = 0 AND ArrDelay IS NOT NULL THEN ArrDelay END) AS avg_arrival_delay,
    AVG(CASE WHEN Cancelled = 0 AND Diverted = 0 AND ArrDelay IS NOT NULL
        THEN CASE WHEN ArrDelay <= 15 THEN 1.0 ELSE 0.0 END END) * 100 AS on_time_percentage,
    AVG(CASE WHEN Cancelled = 0 AND Diverted = 0 AND ArrDelay IS NOT NULL
        THEN CASE WHEN ArrDelay > 60 THEN 1.0 ELSE 0.0 END END) * 100 AS severe_delay_percentage,
    AVG(Cancelled) * 100 AS cancellation_percentage,
    AVG(Diverted) * 100 AS diversion_percentage
"""


def score_from_row(row: tuple) -> dict | None:
    """Same scoring math as compute_health_score, applied to one row of
    RAW_STAT_SELECT_EXPRS output (in that column order) instead of running
    its own query. Lets a caller compute the raw stats for many entities in
    one grouped query and still get identical, non-duplicated scoring."""
    total_flights = int(row[0] or 0)
    if total_flights == 0:
        return None

    completed_flights = int(row[1] or 0)
    avg_arrival_delay = float(row[2] or 0)
    on_time_percentage = float(row[3] or 0)
    severe_delay_percentage = float(row[4] or 0)
    cancellation_percentage = float(row[5] or 0)
    diversion_percentage = float(row[6] or 0)

    reliability_score = _clamp(on_time_percentage)
    delay_score = _clamp(100 - max(avg_arrival_delay, 0) * 2)
    severe_delay_score = _clamp(100 - severe_delay_percentage * 5)
    cancellation_score = _clamp(100 - cancellation_percentage * 10)
    diversion_score = _clamp(100 - diversion_percentage * 20)

    health_score = round(
        reliability_score * 0.290
        + delay_score * 0.251
        + severe_delay_score * 0.275
        + cancellation_score * 0.125
        + diversion_score * 0.059,
        2,
    )

    return {
        "score": health_score,
        "rating": _get_rating(health_score),
        "sample": {
            "total_flights": total_flights,
            "completed_flights": completed_flights,
            "minimum_for_full_confidence": MINIMUM_FLIGHTS_FOR_FULL_CONFIDENCE,
            "status": "sufficient" if total_flights >= MINIMUM_FLIGHTS_FOR_FULL_CONFIDENCE else "limited",
        },
        "component_scores": {
            "reliability": round(reliability_score, 2),
            "delay_severity": round(delay_score, 2),
            "severe_delay_exposure": round(severe_delay_score, 2),
            "cancellation_resilience": round(cancellation_score, 2),
            "diversion_resilience": round(diversion_score, 2),
        },
        "weights": {
            "reliability": 0.290,
            "delay_severity": 0.251,
            "severe_delay_exposure": 0.275,
            "cancellation_resilience": 0.125,
            "diversion_resilience": 0.059,
        },
        "calibration": {
            "method": "Each weight is that component's Pearson correlation with the SAME "
            "route's actual future on-time rate, normalized to sum to 1.0 -- not hand-picked.",
            "sample_size_routes": 6133,
            "correlations_with_future_performance": {
                "reliability": 0.585,
                "delay_severity": 0.507,
                "severe_delay_exposure": 0.556,
                "cancellation_resilience": 0.253,
                "diversion_resilience": 0.119,
            },
        },
    }


def compute_health_score(where_clause: str, params: list[Any]) -> dict | None:
    """where_clause is a raw SQL WHERE body (no leading 'WHERE'), applied to
    the flights table. Returns None if there's no matching data at all.

    For scoring MANY entities at once (e.g. every carrier or the top N
    airports), prefer one GROUP BY query with RAW_STAT_SELECT_EXPRS plus
    score_from_row per result row -- this function runs its own full
    query and is meant for the single-entity case."""
    query = f"SELECT {RAW_STAT_SELECT_EXPRS} FROM flights WHERE {where_clause}"
    with open_readonly_connection() as connection:
        row = connection.execute(query, params).fetchone()
    return score_from_row(row)
