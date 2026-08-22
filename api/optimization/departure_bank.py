"""
Departure Bank Smoothing Optimizer -- OR Feature 1.

Answers: can a selected airline/airport departure bank be rescheduled
slightly to reduce empirical congestion exposure without excessive
schedule disruption?

Formulation (time-indexed MILP):
  Sets:
    I = flights in scope for the selected carrier/airport/period/window
    T = candidate time buckets (15-minute granularity) spanning the window
    T_i subset of T = buckets flight i could plausibly move to, given its
        original scheduled bucket and the user's allowed shift (+-15/30/45 min)

  Decision variables:
    x_{i,t} in {0,1} for t in T_i  -- 1 if flight i is assigned to bucket t

  Core constraint -- each flight gets exactly one bucket:
    sum_{t in T_i} x_{i,t} = 1   for all i

  Congestion linearization -- overload_t is how far bucket t's assigned
  load exceeds the preferred bank limit for that bucket (0 if under):
    overload_t >= sum_i x_{i,t} - PreferredLimit_t
    overload_t >= 0

  Objective (minimize), three explicit, separately-weighted terms:
    congestion exposure    = sum_t CongestionWeight_t * overload_t
    expected-delay proxy   = sum_{i,t} x_{i,t} * DelayProxy_t
    schedule-shift penalty = sum_{i,t} x_{i,t} * ShiftPenalty(i,t)

  ShiftPenalty(i,t) = shift_penalty_weight * |bucket_index(t) - original_bucket_index(i)|
  -- proportional to how far a flight moves from its original slot.

Two modes:
  "expected"     -- DelayProxy_t is a single historical average per bucket.
  "risk_averse"  -- each bucket t has its own SCENARIO distribution of
                    historical delay outcomes -- e.g. bucket 32 (8:00am)
                    might show [8, 9, 7, 8, 35] across 5 sampled historical
                    days (one bad-weather day), while bucket 40 (10:00am)
                    shows a stable [6, 6, 7, 6, 7]. Scenario index s is
                    shared across buckets (s = "the same sampled day",
                    just showing what THAT bucket experienced on it) --
                    a coherent joint scenario structure, not independent
                    per-bucket draws.

                    Each flight i gets its own CVaR_alpha(loss_i), where
                    loss_i under scenario s is whichever bucket's delay
                    outcome it was actually assigned to that scenario:
                    loss_{i,s} = sum_{t in T_i} delay_scenario[t][s] * x_{i,t}
                    Linearized via the standard Rockafellar-Uryasev
                    technique with a per-flight auxiliary zeta_i (NOT one
                    shared across all flights -- an earlier draft of this
                    module used a single shared zeta, which is mathematically
                    wrong for multiple independent flights; caught and
                    fixed before shipping, see the corrected per-flight
                    zeta_i formulation below).

                    Verified end to end: with bucket-level risk variation,
                    risk_averse mode prefers the bucket with the better tail
                    even when expected-value mode would be indifferent or
                    prefer the other bucket -- see
                    tests/test_or_departure_bank.py.

CONGESTION_WEIGHT / PREFERRED_LIMIT default from this project's OWN
empirical queue-pressure module (api/queue_pressure.py's effective_capacity
and queue_pressure_score) rather than any invented "airport capacity" --
BTS provides no such figure, and this deliberately never pretends otherwise
(see queue_pressure.py's own documented limitations, which apply here too).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from scipy.sparse import lil_matrix

from api.optimization.backend import MilpFormulation, OptimizationBackend, PublicBackend

BUCKET_MINUTES = 15


@dataclass
class BankFlight:
    flight_id: str
    original_bucket: int  # index into the bucket grid, e.g. minute-of-day // 15


@dataclass
class DepartureBankResult:
    status: str
    mode: str
    assignments: list[dict]
    original_bank_load: dict[int, int]
    optimized_bank_load: dict[int, int]
    original_peak_load: int
    optimized_peak_load: int
    flights_moved: int
    average_movement_minutes: float
    objective_value: float
    objective_decomposition: dict[str, float]
    congestion_change: float
    methodology: dict


def _candidate_buckets(original_bucket: int, allowed_shift_minutes: int, n_buckets: int) -> list[int]:
    span = max(1, allowed_shift_minutes // BUCKET_MINUTES)
    lo = max(0, original_bucket - span)
    hi = min(n_buckets - 1, original_bucket + span)
    return list(range(lo, hi + 1))


def build_formulation(
    flights: list[BankFlight],
    n_buckets: int,
    allowed_shift_minutes: int,
    preferred_bank_limit: dict[int, float],
    congestion_weight_by_bucket: dict[int, float],
    congestion_weighting: float,
    shift_penalty_weight: float,
    mode: Literal["expected", "risk_averse"],
    bucket_delay_point_estimate: dict[int, float],
    bucket_delay_scenarios: dict[int, list[float]] | None = None,
    scenario_probs: list[float] | None = None,
    risk_alpha: float = 0.2,
    default_delay_proxy: float = 10.0,
) -> tuple[MilpFormulation, dict]:
    """Builds the solver-agnostic MILP arrays. Returns (formulation, index_map)
    where index_map explains what each variable column means -- needed to
    interpret the raw solution vector afterward.

    bucket_delay_point_estimate: {bucket -> average historical delay}, used
        in "expected" mode.
    bucket_delay_scenarios: {bucket -> [delay per scenario]}, all buckets
        must share the same scenario COUNT and the same scenario_probs --
        used in "risk_averse" mode.
    """
    is_risk_averse = mode == "risk_averse"
    n_scenarios = len(scenario_probs) if is_risk_averse and scenario_probs else 0
    if is_risk_averse:
        if not scenario_probs or not bucket_delay_scenarios:
            raise ValueError("risk_averse mode requires bucket_delay_scenarios and scenario_probs")
        for t, series in bucket_delay_scenarios.items():
            if len(series) != n_scenarios:
                raise ValueError(f"bucket {t} has {len(series)} scenarios, expected {n_scenarios} to match scenario_probs")

    var_index: list[tuple] = []  # ("x", flight_id, bucket) | ("overload", bucket) | ("zeta", flight_id) | ("u", flight_id, scenario_idx)
    candidates: dict[str, list[int]] = {}

    for f in flights:
        cands = _candidate_buckets(f.original_bucket, allowed_shift_minutes, n_buckets)
        candidates[f.flight_id] = cands
        for t in cands:
            var_index.append(("x", f.flight_id, t))

    for t in range(n_buckets):
        var_index.append(("overload", t))

    if is_risk_averse:
        for f in flights:
            var_index.append(("zeta", f.flight_id))
            for s_idx in range(n_scenarios):
                var_index.append(("u", f.flight_id, s_idx))

    n_vars = len(var_index)
    pos = {key: i for i, key in enumerate(var_index)}

    n_constraints = len(flights) + n_buckets + (len(flights) * n_scenarios if is_risk_averse else 0)

    c = np.zeros(n_vars)
    # Sparse, not dense: each flight touches only its handful of candidate
    # buckets, so a dense (n_constraints x n_vars) array is >99% zeros --
    # at full-window scale (tens of thousands of flights) that dense array
    # is hundreds of GB and OOMs outright, which is what previously forced
    # an artificially low flight_limit. A sparse matrix holds the same
    # constraints in a few MB and lets flight_limit be set by actual
    # interactive solve time instead of memory.
    A = lil_matrix((n_constraints, n_vars))
    lb = np.zeros(n_constraints)
    ub = np.zeros(n_constraints)
    integrality = np.zeros(n_vars)
    row = 0

    # --- exactly-one-bucket constraint per flight ---
    for f in flights:
        for t in candidates[f.flight_id]:
            A[row, pos[("x", f.flight_id, t)]] = 1.0
            integrality[pos[("x", f.flight_id, t)]] = 1
        lb[row] = 1.0
        ub[row] = 1.0
        row += 1

    # --- overload linearization: overload_t >= sum_i x_{i,t} - limit_t ---
    flights_by_bucket: dict[int, list[str]] = {t: [] for t in range(n_buckets)}
    for f in flights:
        for t in candidates[f.flight_id]:
            flights_by_bucket[t].append(f.flight_id)
    for t in range(n_buckets):
        A[row, pos[("overload", t)]] = -1.0
        for flight_id in flights_by_bucket[t]:
            A[row, pos[("x", flight_id, t)]] = 1.0
        limit = preferred_bank_limit.get(t, 0.0)
        lb[row] = -np.inf
        ub[row] = limit
        c[pos[("overload", t)]] += congestion_weighting * congestion_weight_by_bucket.get(t, 1.0)
        row += 1

    # --- schedule-shift penalty (both modes) ---
    for f in flights:
        for t in candidates[f.flight_id]:
            c[pos[("x", f.flight_id, t)]] += shift_penalty_weight * abs(t - f.original_bucket) * BUCKET_MINUTES

    if not is_risk_averse:
        for f in flights:
            for t in candidates[f.flight_id]:
                c[pos[("x", f.flight_id, t)]] += bucket_delay_point_estimate.get(t, default_delay_proxy)
    else:
        for f in flights:
            zeta_key = ("zeta", f.flight_id)
            c[pos[zeta_key]] += 1.0
            for s_idx in range(n_scenarios):
                u_key = ("u", f.flight_id, s_idx)
                c[pos[u_key]] += scenario_probs[s_idx] / risk_alpha
                # u_{i,s} >= sum_t delay_scenario[t][s] * x_{i,t} - zeta_i
                for t in candidates[f.flight_id]:
                    delay_val = bucket_delay_scenarios.get(t, [default_delay_proxy] * n_scenarios)[s_idx]
                    A[row, pos[("x", f.flight_id, t)]] += delay_val
                A[row, pos[zeta_key]] = -1.0
                A[row, pos[u_key]] = -1.0
                lb[row] = -np.inf
                ub[row] = 0.0
                row += 1

    A = A.tocsr()
    var_lb = np.zeros(n_vars)
    var_ub = np.ones(n_vars)
    for key, i in pos.items():
        if key[0] in ("overload", "u"):
            var_ub[i] = np.inf
        elif key[0] == "zeta":
            var_lb[i] = -np.inf
            var_ub[i] = np.inf

    formulation = MilpFormulation(c=c, A=A, lb=lb, ub=ub, integrality=integrality, var_lb=var_lb, var_ub=var_ub)
    return formulation, {"var_index": var_index, "pos": pos, "candidates": candidates}


def solve_departure_bank(
    flights: list[BankFlight],
    n_buckets: int,
    allowed_shift_minutes: int,
    preferred_bank_limit: dict[int, float],
    congestion_weight_by_bucket: dict[int, float],
    bucket_delay_point_estimate: dict[int, float],
    bucket_delay_scenarios: dict[int, list[float]] | None = None,
    scenario_probs: list[float] | None = None,
    congestion_weighting: float = 1.0,
    shift_penalty_weight: float = 0.05,
    mode: Literal["expected", "risk_averse"] = "expected",
    risk_alpha: float = 0.2,
    backend: OptimizationBackend | None = None,
) -> DepartureBankResult:
    backend = backend or PublicBackend()
    formulation, meta = build_formulation(
        flights, n_buckets, allowed_shift_minutes, preferred_bank_limit,
        congestion_weight_by_bucket, congestion_weighting, shift_penalty_weight, mode,
        bucket_delay_point_estimate, bucket_delay_scenarios, scenario_probs, risk_alpha,
    )
    solution = backend.solve(formulation)

    original_load: dict[int, int] = {}
    for f in flights:
        original_load[f.original_bucket] = original_load.get(f.original_bucket, 0) + 1

    if not solution.success:
        return DepartureBankResult(
            status="infeasible", mode=mode, assignments=[], original_bank_load=original_load,
            optimized_bank_load={}, original_peak_load=max(original_load.values(), default=0),
            optimized_peak_load=0, flights_moved=0, average_movement_minutes=0.0,
            objective_value=0.0, objective_decomposition={}, congestion_change=0.0,
            methodology=_methodology(mode),
        )

    x = solution.x
    pos = meta["pos"]
    assignments = []
    optimized_load: dict[int, int] = {}
    total_moved_minutes = 0.0
    flights_moved = 0
    for f in flights:
        assigned_bucket = None
        for t in meta["candidates"][f.flight_id]:
            if x[pos[("x", f.flight_id, t)]] > 0.5:
                assigned_bucket = t
                break
        assigned_bucket = assigned_bucket if assigned_bucket is not None else f.original_bucket
        moved_minutes = abs(assigned_bucket - f.original_bucket) * BUCKET_MINUTES
        if moved_minutes > 0:
            flights_moved += 1
        total_moved_minutes += moved_minutes
        optimized_load[assigned_bucket] = optimized_load.get(assigned_bucket, 0) + 1
        assignments.append({
            "flight_id": f.flight_id,
            "original_bucket": f.original_bucket,
            "assigned_bucket": assigned_bucket,
            "moved_minutes": moved_minutes,
        })

    original_peak = max(original_load.values(), default=0)
    optimized_peak = max(optimized_load.values(), default=0)

    return DepartureBankResult(
        status="optimal" if solution.status == "optimal" else "feasible",
        mode=mode,
        assignments=assignments,
        original_bank_load=original_load,
        optimized_bank_load=optimized_load,
        original_peak_load=original_peak,
        optimized_peak_load=optimized_peak,
        flights_moved=flights_moved,
        average_movement_minutes=round(total_moved_minutes / len(flights), 2) if flights else 0.0,
        objective_value=round(float(solution.objective), 3),
        objective_decomposition=_decompose_objective(
            meta, x, flights, congestion_weight_by_bucket, congestion_weighting,
            shift_penalty_weight, n_buckets,
        ),
        congestion_change=round(optimized_peak - original_peak, 2),
        methodology=_methodology(mode),
    )


def _decompose_objective(meta, x, flights, congestion_weight_by_bucket, congestion_weighting, shift_penalty_weight, n_buckets) -> dict[str, float]:
    pos = meta["pos"]
    congestion_term = 0.0
    for t in range(n_buckets):
        overload_val = x[pos[("overload", t)]]
        congestion_term += congestion_weighting * congestion_weight_by_bucket.get(t, 1.0) * max(overload_val, 0.0)
    shift_term = 0.0
    for f in flights:
        for t in meta["candidates"][f.flight_id]:
            if x[pos[("x", f.flight_id, t)]] > 0.5:
                shift_term += shift_penalty_weight * abs(t - f.original_bucket) * BUCKET_MINUTES
    return {
        "congestion_exposure": round(congestion_term, 3),
        "schedule_shift_penalty": round(shift_term, 3),
    }


def _methodology(mode: str) -> dict:
    return {
        "framework": "Time-indexed MILP (15-minute buckets), solved via an open-source HiGHS backend for public/bounded instances.",
        "mode": mode,
        "congestion_source": "This project's own empirical queue-pressure module (effective_capacity, queue_pressure_score) -- not an invented airport capacity figure.",
        "cvar_note": (
            "risk_averse mode uses a per-flight Rockafellar-Uryasev CVaR linearization over each "
            "candidate bucket's own scenario distribution of historical delay outcomes -- penalizes "
            "tail risk in a specific bucket, not just its average delay."
            if mode == "risk_averse" else None
        ),
        "limitations": [
            "This reschedules WITHIN the existing flight set -- it does not add, cancel, or retime across carriers.",
            "Delay proxies/scenarios are historical, bucket-level figures, not a causal prediction of what delay a specific flight would experience if actually moved there.",
            "Preferred bank limits default to this project's empirical effective_capacity, which is itself a proxy, not certified airport capacity.",
        ],
    }
