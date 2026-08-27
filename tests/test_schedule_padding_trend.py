"""
Tests for the schedule-padding trend model (api/schedule_padding_trend.py).
This upgrades /api/schedule-padding's bare mean-difference-per-period view
with a real OLS trend test, fit from closed-form sufficient statistics
instead of raw rows. These tests verify that closed-form fit is
algebraically correct (matches scipy.stats.linregress on the same raw
data) and that the hypothesis test behaves sanely on known cases.
"""

import sys
from pathlib import Path

import numpy as np
import pytest
from scipy import stats as scipy_stats

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.schedule_padding_trend import (
    MINIMUM_FLIGHTS_FOR_TREND_TEST,
    DAYS_PER_YEAR,
    OLSSufficientStats,
    fit_trend,
)


def _sufficient_stats_from_raw(x: np.ndarray, y: np.ndarray) -> OLSSufficientStats:
    return OLSSufficientStats(
        n=len(x),
        sum_x=float(np.sum(x)),
        sum_y=float(np.sum(y)),
        sum_xy=float(np.sum(x * y)),
        sum_xx=float(np.sum(x * x)),
        sum_yy=float(np.sum(y * y)),
    )


class TestMatchesScipyLinregress:
    def test_slope_intercept_r_squared_p_value_match_scipy(self):
        """The closed-form-from-sufficient-statistics fit must be
        algebraically identical to fitting the same (x, y) directly with
        scipy.stats.linregress -- the whole point of the sufficient-
        statistics approach is that it's the same math, just computed via
        SQL SUM() instead of pulling every row into Python."""
        rng = np.random.default_rng(42)
        n = 5000
        x = np.arange(n, dtype=float)  # day offsets
        true_slope_per_day = 0.01
        noise = rng.normal(0, 5.0, size=n)
        y = 20.0 + true_slope_per_day * x + noise

        stats = _sufficient_stats_from_raw(x, y)
        result = fit_trend(stats)

        ref = scipy_stats.linregress(x, y)

        # fit_trend() rounds its output for API display, so compare against
        # scipy's reference at that same rounding precision, not raw floats.
        assert result["slope_minutes_per_year"] == pytest.approx(ref.slope * DAYS_PER_YEAR, abs=1e-3)
        assert result["intercept_minutes"] == pytest.approx(ref.intercept, abs=1e-3)
        assert result["r_squared"] == pytest.approx(ref.rvalue ** 2, abs=1e-5)
        assert result["p_value"] == pytest.approx(ref.pvalue, rel=1e-3, abs=1e-6)

    def test_confidence_interval_contains_scipy_slope_with_matching_stderr(self):
        rng = np.random.default_rng(7)
        n = 2000
        x = np.arange(n, dtype=float)
        y = 10.0 - 0.02 * x + rng.normal(0, 3.0, size=n)

        stats = _sufficient_stats_from_raw(x, y)
        result = fit_trend(stats)
        ref = scipy_stats.linregress(x, y)

        lo, hi = result["slope_ci_95_minutes_per_year"]
        ref_slope_per_year = ref.slope * DAYS_PER_YEAR
        assert lo < ref_slope_per_year < hi


class TestKnownGroundTruthTrends:
    def test_strong_upward_trend_is_significant_and_positive(self):
        rng = np.random.default_rng(1)
        n = 3000
        x = np.arange(n, dtype=float)
        y = 5.0 + 0.05 * x + rng.normal(0, 2.0, size=n)  # strong, low-noise upward trend

        result = fit_trend(_sufficient_stats_from_raw(x, y))

        assert result["slope_minutes_per_year"] > 0
        assert result["significant_at_0_05"] is True
        assert result["p_value"] < 0.001

    def test_flat_series_is_not_significant(self):
        rng = np.random.default_rng(2)
        n = 3000
        x = np.arange(n, dtype=float)
        y = 15.0 + rng.normal(0, 10.0, size=n)  # no real trend, pure noise

        result = fit_trend(_sufficient_stats_from_raw(x, y))

        assert result["p_value"] > 0.05
        assert result["significant_at_0_05"] is False

    def test_downward_trend_has_negative_slope(self):
        rng = np.random.default_rng(3)
        n = 3000
        x = np.arange(n, dtype=float)
        y = 30.0 - 0.08 * x + rng.normal(0, 2.0, size=n)

        result = fit_trend(_sufficient_stats_from_raw(x, y))

        assert result["slope_minutes_per_year"] < 0
        assert result["significant_at_0_05"] is True


class TestGuardrails:
    def test_too_few_flights_returns_error(self):
        x = np.arange(MINIMUM_FLIGHTS_FOR_TREND_TEST - 1, dtype=float)
        y = x.copy()
        result = fit_trend(_sufficient_stats_from_raw(x, y))
        assert "error" in result

    def test_all_same_day_returns_error_not_divide_by_zero(self):
        n = 100
        x = np.zeros(n)  # every flight on the same day -- no time variation
        y = np.arange(n, dtype=float)
        result = fit_trend(_sufficient_stats_from_raw(x, y))
        assert "error" in result

    def test_zero_flights(self):
        stats = OLSSufficientStats(n=0, sum_x=0.0, sum_y=0.0, sum_xy=0.0, sum_xx=0.0, sum_yy=0.0)
        result = fit_trend(stats)
        assert "error" in result
