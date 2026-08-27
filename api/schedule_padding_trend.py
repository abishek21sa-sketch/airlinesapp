"""
Real inferential statistics for the schedule-padding trend -- upgrades
/api/schedule-padding (api/main.py) from a bare mean-difference-per-period
view (kept as-is for the chart -- it's still a fine descriptive summary)
to an actual hypothesis test: is scheduled-vs-actual padding really
trending over time, or is a year-over-year increase you can eyeball on a
chart within the noise you'd expect from ordinary flight-to-flight
variation?

Model: ordinary least squares of per-flight padding (CRSElapsedTime -
ActualElapsedTime, minutes) against calendar day, fit from closed-form
sufficient statistics (n, sum_x, sum_y, sum_xy, sum_xx, sum_yy) computed by
DuckDB over the FULL matched flight set. Two deliberate choices:

- Sufficient statistics via SQL SUM(), not pulling rows into Python: this
  scales to the full ~60M-row warehouse without materializing anything
  bigger than six numbers, the same discipline as the rest of this
  project's DuckDB access.
- Regressing flight-level data, not period-level averages: regressing a
  handful of yearly/monthly means against time would pseudo-replicate --
  it throws away real degrees of freedom (n = number of periods, maybe
  single digits) and can make a trend look far more statistically
  significant than the underlying data supports. Fitting against every
  matched flight gives the honest n and the honest p-value.

Hypothesis test: two-sided t-test on the slope, H0: no trend (slope == 0).
Disclosed, not hidden: with tens of millions of flights, almost any nonzero
slope will be "statistically significant" in the classic sense -- the
operationally meaningful number is slope_minutes_per_year, not the p-value
alone.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from scipy import stats as scipy_stats

from api.db import open_readonly_connection

MINIMUM_FLIGHTS_FOR_TREND_TEST = 30  # below this, a t-test's normal-approximation assumptions are unreliable
DAYS_PER_YEAR = 365.25


@dataclass
class OLSSufficientStats:
    n: int
    sum_x: float
    sum_y: float
    sum_xy: float
    sum_xx: float
    sum_yy: float


def _query_sufficient_stats(where: str, params: list) -> OLSSufficientStats:
    query = f"""
    WITH scoped AS (
        SELECT
            (FlightDate - DATE '1970-01-01') AS day_offset,
            CAST(CRSElapsedTime AS DOUBLE) - CAST(ActualElapsedTime AS DOUBLE) AS padding_minutes
        FROM flights
        WHERE {where}
    )
    SELECT
        COUNT(*) AS n,
        SUM(day_offset) AS sum_x,
        SUM(padding_minutes) AS sum_y,
        SUM(day_offset * padding_minutes) AS sum_xy,
        SUM(day_offset * day_offset) AS sum_xx,
        SUM(padding_minutes * padding_minutes) AS sum_yy
    FROM scoped
    """
    with open_readonly_connection() as connection:
        row = connection.execute(query, params).fetchone()
    n = int(row[0])
    if n == 0:
        return OLSSufficientStats(n=0, sum_x=0.0, sum_y=0.0, sum_xy=0.0, sum_xx=0.0, sum_yy=0.0)
    return OLSSufficientStats(
        n=n,
        sum_x=float(row[1]),
        sum_y=float(row[2]),
        sum_xy=float(row[3]),
        sum_xx=float(row[4]),
        sum_yy=float(row[5]),
    )


def fit_trend(stats: OLSSufficientStats) -> dict[str, Any]:
    """Closed-form simple linear regression (padding_minutes ~ day_offset)
    plus a two-sided t-test on the slope, computed from sufficient
    statistics alone -- algebraically identical to fitting the same model
    on the raw rows directly (verified against scipy.stats.linregress on
    synthetic data in tests)."""
    n = stats.n
    if n < MINIMUM_FLIGHTS_FOR_TREND_TEST:
        return {"error": f"Need at least {MINIMUM_FLIGHTS_FOR_TREND_TEST} matched flights for a trend test, got {n}."}

    sxx_centered = stats.sum_xx - (stats.sum_x ** 2) / n
    if sxx_centered <= 0:
        return {"error": "All matched flights fall on the same day -- no time variation to fit a trend against."}

    sxy_centered = stats.sum_xy - (stats.sum_x * stats.sum_y) / n
    syy_centered = stats.sum_yy - (stats.sum_y ** 2) / n

    slope_per_day = sxy_centered / sxx_centered
    intercept = (stats.sum_y - slope_per_day * stats.sum_x) / n

    sse = max(syy_centered - slope_per_day * sxy_centered, 0.0)  # guard tiny FP-cancellation negatives
    df = n - 2
    residual_variance = sse / df
    se_slope = (residual_variance / sxx_centered) ** 0.5

    if se_slope == 0:
        t_stat = float("inf") if slope_per_day != 0 else 0.0
        p_value = 0.0 if slope_per_day != 0 else 1.0
    else:
        t_stat = slope_per_day / se_slope
        p_value = 2 * scipy_stats.t.sf(abs(t_stat), df=df)

    t_crit = scipy_stats.t.ppf(0.975, df=df)
    slope_ci_per_day = (slope_per_day - t_crit * se_slope, slope_per_day + t_crit * se_slope)

    r_squared = (sxy_centered ** 2) / (sxx_centered * syy_centered) if syy_centered > 0 else 0.0

    return {
        "n_flights": n,
        "slope_minutes_per_year": round(slope_per_day * DAYS_PER_YEAR, 4),
        "slope_ci_95_minutes_per_year": [
            round(slope_ci_per_day[0] * DAYS_PER_YEAR, 4),
            round(slope_ci_per_day[1] * DAYS_PER_YEAR, 4),
        ],
        "p_value": round(float(p_value), 6),
        "significant_at_0_05": bool(p_value < 0.05),
        "r_squared": round(float(r_squared), 6),
        "intercept_minutes": round(intercept, 4),
        "degrees_of_freedom": df,
    }


def get_schedule_padding_trend(where: str, params: list) -> dict[str, Any]:
    stats = _query_sufficient_stats(where, params)
    result = fit_trend(stats)
    result["methodology"] = {
        "model": "Ordinary least squares: per-flight padding (CRSElapsedTime - ActualElapsedTime, minutes) regressed against calendar day, fit via closed-form sufficient statistics over every matched flight -- not period-level averages, which would pseudo-replicate and understate real degrees of freedom.",
        "hypothesis_test": "Two-sided t-test on the slope, H0: no trend (slope == 0).",
        "limitations": [
            "Correlational, not causal -- a significant upward slope is consistent with deliberate schedule padding but equally consistent with genuinely slower average flights (e.g. rising air traffic congestion) being reflected in scheduled times with a lag.",
            "A statistically significant slope on tens of millions of flights can still be operationally tiny -- check slope_minutes_per_year, not just significant_at_0_05, before treating this as meaningful.",
        ],
    }
    return result
