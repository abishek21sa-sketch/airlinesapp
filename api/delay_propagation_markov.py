"""
Markov-chain delay propagation model -- Phase 3 of the OR/statistics
upgrade roadmap, additive to the existing correlation-based
/api/delay-propagation (api/main.py), which stays as a fine one-step
"here's the association" summary and is NOT replaced by this.

This answers a genuinely different question the correlation view can't:
multi-step forecasts like "given flight 1 in a rotation lands severely
delayed, what's the probability flight 3 (two legs later) is ALSO
delayed, accounting for how much buffer absorbs it along the way." A
single correlation coefficient only ever describes one step and can't be
composed like that; a Markov chain can, via matrix powers.

States: 4 arrival-delay severity buckets, consistent with this project's
own ON_TIME_THRESHOLD/MAJOR_DELAY conventions (config.py):
  on_time   ArrDelay <= 0
  minor     0  < ArrDelay <= 15
  moderate  15 < ArrDelay <= 60
  severe    ArrDelay > 60

Why arrival delay, not departure delay, as the state: arrival delay is
what actually "hands off" between legs -- an aircraft becomes available
for its next flight however late it lands, that lateness (minus whatever
turnaround buffer absorbs) becomes the next leg's departure delay, which
then compounds through flight time into ITS arrival delay. Modeling
ArrDelay(n) -> ArrDelay(n+1) directly captures one full hop of that
process and composes cleanly for multi-step forecasting.

Transition matrix P[from_state][to_state] is the empirical (maximum-
likelihood) estimate from consecutive same-tail, same-day flight pairs --
reusing the EXACT same sequencing convention as /api/delay-propagation
(same-day only, scheduled-time ordered, no guessing across a day
boundary), not rebuilt from scratch. Estimated SEPARATELY per turnaround-
tightness bucket (tight/normal/loose, same thresholds as the correlation
endpoint), since turnaround buffer is exactly the mechanism that should
change how much a delay carries over.

Multi-step forecast limitation, disclosed not hidden: it assumes the SAME
turnaround-tightness bucket applies at every leg in the forecast, for
tractability. Real rotations often mix turnaround types leg to leg; a
caller wanting per-leg turnaround types would need to compose the
per-bucket matrices manually (P_tight @ P_loose @ ... in the actual
sequence), which this module's matrices support but its convenience
multi-step helper does not do automatically.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import numpy as np

from api.db import open_readonly_connection

DEFAULT_LOOKBACK_DAYS = 365

STATES = ("on_time", "minor", "moderate", "severe")
STATE_INDEX = {name: i for i, name in enumerate(STATES)}

TIGHT_TURNAROUND_MINUTES = 25
TARGET_TURNAROUND_MINUTES = 45

MINIMUM_PAIRS_PER_TRANSITION_ROW = 20  # below this, a row's estimated probabilities are disclosed as low-confidence


def _state_case_sql(column: str) -> str:
    return (
        f"CASE WHEN {column} <= 0 THEN 'on_time' "
        f"WHEN {column} <= 15 THEN 'minor' "
        f"WHEN {column} <= 60 THEN 'moderate' "
        f"ELSE 'severe' END"
    )


def _query_transition_counts(carrier: str | None, start_date: str, end_date: str) -> list[dict]:
    clauses = [
        "FlightDate BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)",
        "Cancelled = 0", "Diverted = 0", "Tail_Number IS NOT NULL", "Tail_Number != ''",
    ]
    params: list[Any] = [start_date, end_date]
    if carrier:
        clauses.append("Marketing_Airline_Network = ?")
        params.append(carrier.upper())
    where = " AND ".join(clauses)

    query = f"""
    WITH scoped AS (
        SELECT
            Tail_Number, FlightDate,
            TRY_CAST(CRSDepTime AS INTEGER) AS crs_dep_hhmm,
            TRY_CAST(CRSArrTime AS INTEGER) AS crs_arr_hhmm,
            ArrDelay
        FROM flights
        WHERE {where}
    ),
    minutes AS (
        SELECT
            Tail_Number, FlightDate, ArrDelay,
            (crs_dep_hhmm / 100) * 60 + (crs_dep_hhmm % 100) AS crs_dep_minutes,
            (crs_arr_hhmm / 100) * 60 + (crs_arr_hhmm % 100) AS crs_arr_minutes
        FROM scoped
        WHERE crs_dep_hhmm IS NOT NULL AND crs_arr_hhmm IS NOT NULL AND ArrDelay IS NOT NULL
    ),
    sequenced AS (
        SELECT
            ArrDelay AS current_arr_delay,
            LEAD(ArrDelay) OVER (
                PARTITION BY Tail_Number, FlightDate ORDER BY crs_dep_minutes
            ) AS next_arr_delay,
            LEAD(crs_dep_minutes) OVER (
                PARTITION BY Tail_Number, FlightDate ORDER BY crs_dep_minutes
            ) - crs_arr_minutes AS turnaround_to_next
        FROM minutes
    ),
    pairs AS (
        SELECT * FROM sequenced
        WHERE next_arr_delay IS NOT NULL AND turnaround_to_next IS NOT NULL
    )
    SELECT
        {_state_case_sql('current_arr_delay')} AS from_state,
        {_state_case_sql('next_arr_delay')} AS to_state,
        CASE
            WHEN turnaround_to_next <= {TIGHT_TURNAROUND_MINUTES} THEN 'tight'
            WHEN turnaround_to_next <= {TARGET_TURNAROUND_MINUTES} THEN 'normal'
            ELSE 'loose'
        END AS turnaround_bucket,
        COUNT(*) AS n
    FROM pairs
    GROUP BY from_state, to_state, turnaround_bucket
    """
    with open_readonly_connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [{"from_state": r[0], "to_state": r[1], "turnaround_bucket": r[2], "n": int(r[3])} for r in rows]


def build_transition_matrices(counts: list[dict]) -> dict[str, dict[str, Any]]:
    """Turns raw (from_state, to_state, turnaround_bucket, n) counts into
    one row-stochastic 4x4 transition matrix per turnaround bucket, plus
    per-row sample sizes and a low_confidence flag for thin rows. A
    from_state with zero observed transitions (shouldn't happen with real
    data but guarded) falls back to an identity row (stays in the same
    state with probability 1) rather than a NaN-producing division by
    zero -- disclosed via low_confidence, not silently plausible-looking."""
    matrices: dict[str, dict[str, Any]] = {}
    for bucket in ("tight", "normal", "loose"):
        row_totals = {s: 0 for s in STATES}
        cell_counts = {s: {t: 0 for t in STATES} for s in STATES}
        for row in counts:
            if row["turnaround_bucket"] != bucket:
                continue
            cell_counts[row["from_state"]][row["to_state"]] += row["n"]
            row_totals[row["from_state"]] += row["n"]

        matrix = np.zeros((len(STATES), len(STATES)))
        low_confidence_rows = []
        for i, from_state in enumerate(STATES):
            total = row_totals[from_state]
            if total == 0:
                matrix[i, i] = 1.0
                low_confidence_rows.append(from_state)
                continue
            if total < MINIMUM_PAIRS_PER_TRANSITION_ROW:
                low_confidence_rows.append(from_state)
            for j, to_state in enumerate(STATES):
                matrix[i, j] = cell_counts[from_state][to_state] / total

        matrices[bucket] = {
            "matrix": matrix,
            "row_totals": row_totals,
            "low_confidence_rows": low_confidence_rows,
        }
    return matrices


def multi_step_distribution(matrix: np.ndarray, start_state: str, n_steps: int) -> dict[str, float]:
    """P(state after n_steps | starting in start_state), via matrix power --
    the actual new capability a single correlation coefficient can't
    provide. n_steps=1 is just the transition matrix's own row for
    start_state; n_steps=2+ is genuinely composed multi-hop propagation."""
    if n_steps < 1:
        raise ValueError("n_steps must be >= 1")
    start_vec = np.zeros(len(STATES))
    start_vec[STATE_INDEX[start_state]] = 1.0
    powered = np.linalg.matrix_power(matrix, n_steps)
    result_vec = start_vec @ powered
    return {state: round(float(p), 4) for state, p in zip(STATES, result_vec)}


def get_delay_propagation_markov(
    *,
    carrier: str | None = None,
    start_state: str = "severe",
    forecast_steps: int = 3,
    turnaround_bucket: str = "normal",
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    if start_state not in STATES:
        return {"error": f"start_state must be one of {STATES}"}
    if turnaround_bucket not in ("tight", "normal", "loose"):
        return {"error": "turnaround_bucket must be 'tight', 'normal', or 'loose'"}
    if forecast_steps < 1 or forecast_steps > 6:
        return {"error": "forecast_steps must be between 1 and 6"}

    # No date scoping here at all used to mean this ran LAG/LEAD window
    # functions over the FULL unscoped ~59M-row history on every call --
    # confirmed via real production testing this crashed the deployed
    # backend outright (same root cause as the pre-existing
    # /api/delay-propagation, which had the identical gap -- see its
    # docstring in api/main.py for the full incident). Defaulting to a
    # trailing-12-month window here too, same fix, same reasoning.
    if not start_date or not end_date:
        with open_readonly_connection() as connection:
            max_date = connection.execute("SELECT MAX(FlightDate) FROM flights").fetchone()[0]
        end_date = end_date or str(max_date)
        start_date = start_date or str(date.fromisoformat(str(max_date)) - timedelta(days=DEFAULT_LOOKBACK_DAYS))

    counts = _query_transition_counts(carrier, start_date, end_date)
    if not counts:
        return {"error": "No same-day multi-leg rotations matched that filter."}

    matrices = build_transition_matrices(counts)
    chosen = matrices[turnaround_bucket]

    forecasts = {
        step: multi_step_distribution(chosen["matrix"], start_state, step)
        for step in range(1, forecast_steps + 1)
    }

    return {
        "carrier": carrier.upper() if carrier else None,
        "date_range": f"{start_date} to {end_date}",
        "start_state": start_state,
        "turnaround_bucket": turnaround_bucket,
        "forecast_steps": forecast_steps,
        "multi_step_forecast": forecasts,
        "transition_matrices": {
            bucket: {
                "matrix": {
                    from_state: {
                        to_state: round(float(chosen_bucket["matrix"][STATE_INDEX[from_state], STATE_INDEX[to_state]]), 4)
                        for to_state in STATES
                    }
                    for from_state in STATES
                },
                "row_sample_sizes": chosen_bucket["row_totals"],
                "low_confidence_rows": chosen_bucket["low_confidence_rows"],
            }
            for bucket, chosen_bucket in matrices.items()
        },
        "methodology": {
            "framework": "Empirical (maximum-likelihood) Markov chain over 4 arrival-delay severity states, estimated separately per turnaround-tightness bucket from consecutive same-tail same-day flight pairs.",
            "states": list(STATES),
            "state_definition": "on_time: ArrDelay<=0min; minor: 0-15min; moderate: 15-60min; severe: >60min.",
            "sequencing": "Same convention as /api/delay-propagation: same calendar day only, ordered by scheduled (not actual) departure time, no cross-day-boundary linking.",
            "multi_step_note": "Forecasts assume the SAME turnaround-tightness bucket applies at every leg -- a disclosed simplification for tractability, not a claim that real rotations never mix turnaround types.",
            "limitations": [
                "Descriptive/empirical, not causal -- a transition probability is an observed historical frequency, not a claim that one flight's delay causes the next.",
                "Rows with fewer than " + str(MINIMUM_PAIRS_PER_TRANSITION_ROW) + " observed transitions are flagged low_confidence, not hidden.",
                "This project's own no-future-leakage discipline doesn't apply here the way it does to the Predictive Risk Screen -- this is a within-rotation propagation model, not a forward time-series forecast across calendar periods.",
            ],
        },
    }
