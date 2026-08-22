"""
Connects the Predictive Risk Screen (api/predictive_risk.py) to the Network
Protection Portfolio Optimizer (api/optimization/network_protection.py).

Without this, the portfolio optimizer can only allocate resources based on
what ALREADY happened (historical severe-delay rate, volume, etc.) -- a
reasonable baseline, but a genuinely more useful decision tool asks "where
is trouble headed," not just "where has trouble been." This lets
predicted_severe_delay_risk (the trained model's own forward-looking
probability, with its own disclosed calibration accuracy) become one more
available primary_metric alongside the historical ones -- never silently
blended into them. Choosing to optimize by predicted risk instead of
historical rate is a real, visible choice the user makes, not a hidden
default.
"""

from __future__ import annotations

from typing import Any, Callable

from api.optimization.network_protection import InterventionCandidate


def build_candidates_from_risk_scores(
    risk_results: list[dict[str, Any]],
    cost_per_candidate: float | dict[str, float] = 1.0,
) -> list[InterventionCandidate]:
    """Takes a list of already-computed get_predictive_operational_risk()
    results (one per entity) and packages them as InterventionCandidates.
    Kept separate from the DB-querying/model-fitting step on purpose --
    this function is pure packaging logic, testable without a live
    warehouse connection, unlike the scoring calls that feed it."""
    candidates = []
    for result in risk_results:
        if "error" in result:
            continue  # an entity the model couldn't score -- excluded, not silently zeroed
        entity = result["entity"]
        cost = cost_per_candidate.get(entity, 1.0) if isinstance(cost_per_candidate, dict) else cost_per_candidate
        components = {
            "predicted_severe_delay_risk": result["risk_probability"],
            "current_severe_delay_rate": result["current_features"]["severe_delay_rate"],
            "current_cancellation_rate": result["current_features"]["cancellation_rate"],
            "recent_trend": result["current_features"].get("trend_severe_delay_rate", 0.0),
        }
        candidates.append(InterventionCandidate(
            candidate_id=entity,
            candidate_type=result["entity_type"],
            cost=cost,
            components=components,
        ))
    return candidates


def score_entities_for_portfolio(
    entities: list[str],
    entity_type: str,
    score_fn: Callable[..., dict[str, Any]],
    **score_kwargs: Any,
) -> list[dict[str, Any]]:
    """Calls score_fn (normally get_predictive_operational_risk) once per
    entity and collects the results. Separated from
    build_candidates_from_risk_scores so the DB-dependent part and the
    pure-packaging part can be tested independently -- the packaging
    function above has real, executed tests; this orchestration wrapper
    is a thin, low-risk loop around a function that itself already has
    its own separate verification."""
    results = []
    for entity in entities:
        results.append(score_fn(entity_type=entity_type, entity=entity, **score_kwargs))
    return results
