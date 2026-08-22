"""
Queue pressure / congestion index for a single airport.

Ported from the prior platform's queue_pressure.py, adapted to this
warehouse's actual column names (CRSDepTime, Marketing_Airline_Network,
TaxiOut) and with real taxi-out data wired up -- the original never had
this component populated (it was hardcoded to NULL there; our 119-column
pull includes TaxiOut where the prior 20-column dataset didn't).

Methodology, in short:
1. Bucket each day's flights into 24 hourly "departure banks" by scheduled
   departure hour, per airport.
2. Estimate each hour's practical capacity as the 90th percentile of
   historically COMPLETED departures in that same hour -- a proxy for real
   throughput since BTS doesn't publish runway/gate capacity.
3. Combine four signals into one 0-100 pressure score per hour: utilization
   (scheduled vs. estimated capacity), delay accumulation (delayed + unfinished
   share), average departure delay, and average taxi-out time.
4. Only score hours with enough evidence (minimum scheduled departures and
   observed days); everything else is disclosed as insufficient evidence
   rather than silently scored.
5. Empirically detect a congestion threshold: the utilization level where
   departure delay meaningfully jumps, found by testing every possible split
   point and keeping the one with the best fit AND a real delay increase --
   not assumed, tested against the data.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from api.db import open_readonly_connection

PRESSURE_WEIGHTS = {
    "utilization": 0.45,
    "delay_accumulation": 0.25,
    "departure_delay": 0.20,
    "taxi_out": 0.10,
}
DEFAULT_MINIMUM_SCHEDULED_DEPARTURES = 10.0
DEFAULT_MINIMUM_OBSERVED_DAYS = 30


def _clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    return max(lower, min(upper, value))


def _pressure_state(score: float, utilization: float) -> str:
    if score >= 75 or utilization >= 1.15:
        return "critical"
    if score >= 55 or utilization >= 1.0:
        return "high"
    if score >= 35 or utilization >= 0.85:
        return "moderate"
    return "low"


def _weighted_score(components: dict, available: dict) -> tuple:
    active_weight = sum(PRESSURE_WEIGHTS[k] for k in PRESSURE_WEIGHTS if available[k])
    if active_weight <= 0:
        return 0.0, {k: 0.0 for k in PRESSURE_WEIGHTS}
    contributions = {
        k: (components[k] * PRESSURE_WEIGHTS[k] / active_weight if available[k] else 0.0)
        for k in PRESSURE_WEIGHTS
    }
    return round(sum(contributions.values()), 3), {k: round(v, 3) for k, v in contributions.items()}


def score_departure_banks(
    rows: list[dict],
    minimum_scheduled_departures: float = DEFAULT_MINIMUM_SCHEDULED_DEPARTURES,
    minimum_observed_days: int = DEFAULT_MINIMUM_OBSERVED_DAYS,
) -> list[dict]:
    scored = []
    for raw in rows:
        hour = int(raw.get("scheduled_hour") or 0)
        scheduled = max(float(raw.get("scheduled_departures") or 0), 0.0)
        completed = max(float(raw.get("completed_departures") or 0), 0.0)
        capacity = max(float(raw.get("effective_capacity") or 0), 0.0)
        delayed = max(float(raw.get("delayed_departures") or 0), 0.0)
        avg_delay = max(float(raw.get("avg_departure_delay") or 0), 0.0)
        observed_days = int(raw.get("observed_days") or 0)
        raw_taxi_out = raw.get("avg_taxi_out")
        taxi_out_available = raw_taxi_out is not None
        taxi_out = max(float(raw_taxi_out or 0), 0.0)

        utilization = scheduled / capacity if capacity > 0 else 0.0
        delayed_share = delayed / scheduled if scheduled > 0 else 0.0
        unfinished_share = max(scheduled - completed, 0.0) / scheduled if scheduled > 0 else 0.0
        accumulation = min(delayed_share + unfinished_share, 1.0)
        evidence_sufficient = (
            scheduled >= minimum_scheduled_departures
            and observed_days >= minimum_observed_days
            and capacity > 0
        )

        components = {
            "utilization": _clamp(utilization / 1.20 * 100.0),
            "delay_accumulation": _clamp(accumulation * 100.0),
            "departure_delay": _clamp(avg_delay / 60.0 * 100.0),
            "taxi_out": _clamp(max(taxi_out - 10.0, 0.0) / 30.0 * 100.0),
        }
        available = {
            "utilization": capacity > 0,
            "delay_accumulation": scheduled > 0,
            "departure_delay": True,
            "taxi_out": taxi_out_available,
        }
        score, contributions = _weighted_score(components, available)
        state = _pressure_state(score, utilization) if evidence_sufficient else "insufficient_evidence"
        scored.append({
            "scheduled_hour": hour,
            "scheduled_departures": round(scheduled, 2),
            "completed_departures": round(completed, 2),
            "effective_capacity": round(capacity, 2),
            "avg_departure_delay": round(avg_delay, 2),
            "avg_taxi_out": round(taxi_out, 2) if taxi_out_available else None,
            "taxi_out_available": taxi_out_available,
            "observed_days": observed_days,
            "utilization": round(utilization, 4),
            "delayed_share": round(delayed_share, 4),
            "unfinished_share": round(unfinished_share, 4),
            "queue_pressure_score": score,
            "pressure_state": state,
            "evidence_sufficient": evidence_sufficient,
            "component_scores": {k: round(v, 3) for k, v in components.items()},
        })
    scored.sort(key=lambda item: item["scheduled_hour"])
    return scored


def detect_congestion_threshold(banks: list[dict], minimum_delay_uplift_minutes: float = 2.0) -> dict:
    eligible = sorted(
        [b for b in banks if b.get("evidence_sufficient")],
        key=lambda item: float(item["utilization"]),
    )

    if len(eligible) < 6:
        return {
            "status": "insufficient_evidence",
            "eligible_banks": len(eligible),
            "minimum_required": 6,
        }

    adverse_candidates = []
    all_candidates = []

    for split in range(3, len(eligible) - 2):
        low = eligible[:split]
        high = eligible[split:]
        low_delays = [float(item.get("avg_departure_delay") or 0.0) for item in low]
        high_delays = [float(item.get("avg_departure_delay") or 0.0) for item in high]
        low_mean = sum(low_delays) / len(low_delays)
        high_mean = sum(high_delays) / len(high_delays)
        uplift = high_mean - low_mean
        sse = (
            sum((v - low_mean) ** 2 for v in low_delays)
            + sum((v - high_mean) ** 2 for v in high_delays)
        )
        threshold = (float(low[-1]["utilization"]) + float(high[0]["utilization"])) / 2.0
        candidate = {
            "status": "detected",
            "utilization_threshold": round(threshold, 4),
            "below_threshold_mean_departure_delay": round(low_mean, 2),
            "above_threshold_mean_departure_delay": round(high_mean, 2),
            "delay_uplift_minutes": round(uplift, 2),
            "fit_sse": round(sse, 3),
        }
        all_candidates.append(candidate)
        if uplift >= minimum_delay_uplift_minutes:
            adverse_candidates.append(candidate)

    if adverse_candidates:
        return min(adverse_candidates, key=lambda c: c["fit_sse"])

    return {
        "status": "no_adverse_threshold",
        "eligible_banks": len(eligible),
        "reason": "No utilization breakpoint produced a meaningful departure-delay increase.",
    }


def summarize_pressure_windows(banks: list[dict]) -> dict:
    eligible = [b for b in banks if b.get("evidence_sufficient")]
    overloaded = [b for b in eligible if b["pressure_state"] in ("high", "critical")]
    highest = max(eligible, key=lambda item: item["queue_pressure_score"], default=None)
    overload_start = overloaded[0]["scheduled_hour"] if overloaded else None
    recovery_hour = None
    if overload_start is not None:
        for b in eligible:
            if b["scheduled_hour"] > overload_start and b["pressure_state"] in ("low", "moderate"):
                recovery_hour = b["scheduled_hour"]
                break
    return {
        "bank_count": len(banks),
        "eligible_bank_count": len(eligible),
        "excluded_low_evidence_banks": len(banks) - len(eligible),
        "high_or_critical_banks": len(overloaded),
        "overload_start_hour": overload_start,
        "recovery_hour": recovery_hour,
        "highest_pressure_bank": highest,
        "congestion_threshold": detect_congestion_threshold(banks),
    }


def _query_departure_banks(start_date: str, end_date: str, airport: str, carrier: str | None) -> list[dict]:
    carrier_clause = "AND Marketing_Airline_Network = ?" if carrier else ""
    params: list[Any] = [start_date, end_date, airport]
    if carrier:
        params.append(carrier.upper())

    query = f"""
    WITH daily_banks AS (
      SELECT
        FlightDate,
        Origin AS airport,
        CAST(FLOOR(CAST(CRSDepTime AS INTEGER) / 100) AS INTEGER) AS scheduled_hour,
        COUNT(*) AS scheduled_departures,
        SUM(CASE WHEN Cancelled = 0 THEN 1 ELSE 0 END) AS completed_departures,
        SUM(CASE WHEN Cancelled = 0 AND DepDelay >= 15 THEN 1 ELSE 0 END) AS delayed_departures,
        AVG(CASE WHEN Cancelled = 0 THEN DepDelay END) AS avg_departure_delay,
        AVG(CASE WHEN Cancelled = 0 THEN TaxiOut END) AS avg_taxi_out
      FROM flights
      WHERE FlightDate BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
        AND Origin = ? AND CRSDepTime IS NOT NULL {carrier_clause}
      GROUP BY FlightDate, Origin, scheduled_hour
    ), capacity AS (
      SELECT scheduled_hour, QUANTILE_CONT(completed_departures, 0.90) AS effective_capacity
      FROM daily_banks GROUP BY scheduled_hour
    )
    SELECT
      d.scheduled_hour,
      AVG(d.scheduled_departures) AS scheduled_departures,
      AVG(d.completed_departures) AS completed_departures,
      AVG(d.delayed_departures) AS delayed_departures,
      AVG(d.avg_departure_delay) AS avg_departure_delay,
      AVG(d.avg_taxi_out) AS avg_taxi_out,
      c.effective_capacity,
      COUNT(*) AS observed_days
    FROM daily_banks d JOIN capacity c USING (scheduled_hour)
    WHERE d.scheduled_hour BETWEEN 0 AND 23
    GROUP BY d.scheduled_hour, c.effective_capacity
    ORDER BY d.scheduled_hour
    """
    keys = [
        "scheduled_hour", "scheduled_departures", "completed_departures",
        "delayed_departures", "avg_departure_delay", "avg_taxi_out",
        "effective_capacity", "observed_days",
    ]
    with open_readonly_connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [dict(zip(keys, row)) for row in rows]


def get_queue_pressure(
    start_date: str,
    end_date: str,
    airport: str,
    carrier: str | None = None,
    minimum_scheduled_departures: float = DEFAULT_MINIMUM_SCHEDULED_DEPARTURES,
    minimum_observed_days: int = DEFAULT_MINIMUM_OBSERVED_DAYS,
) -> dict:
    if date.fromisoformat(start_date) > date.fromisoformat(end_date):
        raise ValueError("start_date cannot be after end_date")
    airport = airport.strip().upper()

    banks = score_departure_banks(
        _query_departure_banks(start_date, end_date, airport, carrier),
        minimum_scheduled_departures=minimum_scheduled_departures,
        minimum_observed_days=minimum_observed_days,
    )
    summary = summarize_pressure_windows(banks)

    return {
        "status": "ok" if banks else "no_data",
        "scope": {
            "start_date": start_date,
            "end_date": end_date,
            "airport": airport,
            "carrier": carrier.upper() if carrier else None,
        },
        "departure_banks": banks,
        "summary": summary,
        "methodology": {
            "framework": "Hourly departure-bank queue-pressure proxy with minimum-volume safeguards and empirical utilization-delay breakpoint detection.",
            "effective_capacity": "90th percentile of observed completed departures for the same airport and scheduled hour across selected days.",
            "weights": PRESSURE_WEIGHTS,
            "missing_component_policy": "Unavailable components are disclosed and remaining component weights are renormalized -- nothing is silently imputed.",
            "limitations": [
                "This is an operational pressure proxy, not a reconstruction of the physical airport queue.",
                "The detected threshold is an empirical association, not proof that utilization caused the delay change.",
                "BTS data does not directly observe gates, runway configuration, controller restrictions, passenger queues, or crew constraints.",
                "Effective capacity is historical and scope-dependent, not certified airport capacity.",
                "Hourly aggregation can hide short-lived within-hour congestion and recovery behavior.",
            ],
        },
    }
