"""
Tests for the Network Protection Portfolio Optimizer (OR Feature 2).
Every assertion here has been executed directly in this session.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.optimization.network_protection import InterventionCandidate, solve_portfolio


class TestDifferentMetricsProduceDifferentPortfolios:
    def test_severe_delay_vs_volume_optimization_diverge(self):
        """The core required property: the same candidates, same budget,
        but a different chosen primary_metric must be able to produce a
        genuinely different portfolio -- not the same answer relabeled."""
        candidates = [
            InterventionCandidate("A", "airport", cost=1.0, components={"severe_delay_rate": 5.0, "volume": 2.1}),
            InterventionCandidate("B", "airport", cost=1.0, components={"severe_delay_rate": 4.3, "volume": 1.3}),
            InterventionCandidate("C", "airport", cost=1.0, components={"severe_delay_rate": 2.9, "volume": 0.96}),
            InterventionCandidate("D", "airport", cost=1.0, components={"severe_delay_rate": 0.4, "volume": 15.5}),
        ]
        r_delay = solve_portfolio(candidates, budget=2.0, primary_metric="severe_delay_rate")
        r_volume = solve_portfolio(candidates, budget=2.0, primary_metric="volume")

        delay_ids = {s["candidate_id"] for s in r_delay.selected}
        volume_ids = {s["candidate_id"] for s in r_volume.selected}
        assert delay_ids != volume_ids
        assert delay_ids == {"A", "B"}
        assert volume_ids == {"A", "D"}


class TestBudgetConstraint:
    def test_never_exceeds_budget(self):
        candidates = [
            InterventionCandidate(f"C{i}", "airport", cost=float(i + 1), components={"metric": float(10 - i)})
            for i in range(5)
        ]
        result = solve_portfolio(candidates, budget=5.0, primary_metric="metric")
        assert result.resource_consumed <= 5.0

    def test_single_expensive_candidate_rejected_with_clear_reason(self):
        candidates = [
            InterventionCandidate("expensive", "airport", cost=100.0, components={"metric": 1000.0}),
            InterventionCandidate("cheap", "airport", cost=1.0, components={"metric": 1.0}),
        ]
        result = solve_portfolio(candidates, budget=5.0, primary_metric="metric")
        selected_ids = {s["candidate_id"] for s in result.selected}
        assert "expensive" not in selected_ids
        rejected = next(r for r in result.rejected if r["candidate_id"] == "expensive")
        assert "exceeds" in rejected["reason"]


class TestMarginalGainCorrectness:
    def test_marginal_gain_accounts_for_replacement_not_just_raw_value(self):
        """A selected candidate's marginal gain should reflect what's LOST
        net of the next-best replacement filling in -- not simply equal
        its own raw component value, when a replacement exists."""
        candidates = [
            InterventionCandidate("A", "x", cost=1.0, components={"m": 5.0}),
            InterventionCandidate("B", "x", cost=1.0, components={"m": 4.3}),
            InterventionCandidate("C", "x", cost=1.0, components={"m": 2.9}),
        ]
        result = solve_portfolio(candidates, budget=2.0, primary_metric="m")
        gain_a = next(s["marginal_gain"] for s in result.selected if s["candidate_id"] == "A")
        # Removing A leaves {B, C}, best pick under budget=2 is just B+C combined isn't possible
        # (budget=2 allows 2 items) -> B(4.3) is kept, C(2.9) becomes the replacement for A.
        # Base total = 5.0+4.3=9.3; without A, best is B+C=4.3+2.9=7.2; gain = 9.3-7.2 = 2.1
        assert abs(gain_a - 2.1) < 1e-6, f"Expected marginal gain 2.1, got {gain_a}"


class TestComponentsNeverCombinedIntoHiddenScore:
    def test_all_components_reported_even_when_not_the_primary_metric(self):
        """Every disclosed component must appear in total_coverage for the
        selected portfolio, not just the one being optimized against."""
        candidates = [
            InterventionCandidate("A", "x", cost=1.0, components={"m1": 5.0, "m2": 1.0, "m3": 9.0}),
        ]
        result = solve_portfolio(candidates, budget=1.0, primary_metric="m1")
        assert set(result.total_coverage.keys()) == {"m1", "m2", "m3"}
