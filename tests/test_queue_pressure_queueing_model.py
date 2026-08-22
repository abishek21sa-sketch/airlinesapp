"""
Tests for the M/G/c queueing-theory addition to api/queue_pressure.py
(Phase 2 of the OR/statistics upgrade roadmap). This project had no actual
queueing-theory model anywhere before this -- effective_capacity was always
a 90th-percentile proxy. These tests verify the Erlang-C/Allen-Cunneen math
against known textbook identities, not just "it runs."
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.queue_pressure import _erlang_c_probability, estimate_queueing_wait, score_departure_banks


class TestErlangCIdentities:
    def test_single_server_erlang_c_equals_utilization(self):
        """For c=1 (M/M/1), Erlang-C reduces to a simple closed form:
        P(wait) = utilization exactly. A textbook identity -- if this
        doesn't hold, the general Erlang-C formula is wrong."""
        for a in (0.1, 0.3, 0.5, 0.7, 0.9, 0.99):
            assert abs(_erlang_c_probability(1, a) - a) < 1e-9

    def test_probability_of_queueing_approaches_zero_at_low_utilization(self):
        assert _erlang_c_probability(10, 1.0) < 0.05  # 10 servers, offered load 1 -- barely any queueing

    def test_probability_of_queueing_approaches_one_near_saturation(self):
        assert _erlang_c_probability(5, 4.99) > 0.9  # offered load right at server count -- near-certain queueing


class TestMMcWaitTimeMatchesTextbookFormula:
    def test_mm1_wait_matches_closed_form(self):
        """M/M/1: Wq = (lambda/mu) / (mu - lambda), a standard closed form
        independent of the general Erlang-C machinery -- cross-check."""
        mu_per_hour = 6.0  # mean service time 10 min
        lam = 3.0  # arrivals/hour
        result = estimate_queueing_wait(
            arrival_rate_per_hour=lam, mean_service_minutes=60.0 / mu_per_hour,
            stddev_service_minutes=0.0, servers=1,
        )
        expected_minutes = ((lam / mu_per_hour) / (mu_per_hour - lam)) * 60
        assert abs(result["expected_wait_minutes_mmc"] - expected_minutes) < 0.01

    def test_zero_variance_service_time_makes_mgc_equal_half_of_mmc(self):
        """Allen-Cunneen: Wq(M/G/c) = Wq(M/M/c) * (Ca^2 + Cs^2) / 2, with
        Ca^2 = 1 (Poisson arrivals). At Cs^2 = 0 (deterministic/zero-variance
        service time, e.g. every flight takes exactly the same taxi-out
        time), the correction factor is exactly (1+0)/2 = 0.5 -- half the
        M/M/c wait, a known result (M/D/c queues wait less than M/M/c)."""
        result = estimate_queueing_wait(
            arrival_rate_per_hour=30.0, mean_service_minutes=10.0,
            stddev_service_minutes=0.0, servers=6,
        )
        assert result["status"] == "stable"
        assert abs(result["expected_wait_minutes_mgc"] - result["expected_wait_minutes_mmc"] * 0.5) < 1e-9

    def test_unit_cv_squared_makes_mgc_equal_mmc(self):
        """When service-time stddev equals its mean (Cs^2 = 1, matching a
        true exponential distribution), the Allen-Cunneen correction factor
        is (1+1)/2 = 1 -- M/G/c collapses back to plain M/M/c exactly, as it
        should since exponential service time IS the M/M/c assumption."""
        mean = 10.0
        result = estimate_queueing_wait(
            arrival_rate_per_hour=30.0, mean_service_minutes=mean,
            stddev_service_minutes=mean,  # stddev == mean -> CV^2 = 1
            servers=6,
        )
        assert result["status"] == "stable"
        assert abs(result["expected_wait_minutes_mgc"] - result["expected_wait_minutes_mmc"]) < 1e-9


class TestUnstableSystemDetection:
    def test_utilization_at_or_above_one_reports_unstable_not_nonsense(self):
        """Arrival rate exceeding theoretical throughput must be reported
        explicitly, not produce a negative or infinite wait time."""
        result = estimate_queueing_wait(
            arrival_rate_per_hour=20.0, mean_service_minutes=10.0,
            stddev_service_minutes=2.0, servers=2,  # capacity = 2*6=12/hr < 20/hr arrivals
        )
        assert result["status"] == "unstable"
        assert "expected_wait_minutes_mmc" not in result

    def test_insufficient_data_is_explicit_not_a_crash(self):
        assert estimate_queueing_wait(0.0, 10.0, 2.0, 3)["status"] == "insufficient_data"
        assert estimate_queueing_wait(10.0, None, 2.0, 3)["status"] == "insufficient_data"
        assert estimate_queueing_wait(10.0, 10.0, 2.0, 0)["status"] == "insufficient_data"


class TestIntegrationWithScoreDepartureBanks:
    def test_queueing_model_attached_and_servers_derived_from_capacity(self):
        """End-to-end through score_departure_banks: a bank with enough
        evidence should get a real queueing_model with a server count
        derived from effective_capacity/mean_taxi_out via Little's Law, not
        a hardcoded number."""
        rows = [{
            "scheduled_hour": 8,
            "scheduled_departures": 40.0,
            "completed_departures": 39.0,
            "delayed_departures": 5.0,
            "avg_departure_delay": 12.0,
            "avg_taxi_out": 18.0,
            "effective_capacity": 45.0,
            "mean_taxi_out": 18.0,
            "stddev_taxi_out": 6.0,
            "observed_days": 60,
        }]
        banks = score_departure_banks(rows)
        assert len(banks) == 1
        bank = banks[0]
        assert bank["evidence_sufficient"] is True
        qm = bank["queueing_model"]
        assert qm["status"] in ("stable", "unstable")
        # servers ~= capacity * mean_service_minutes / 60 = 45 * 18 / 60 = 13.5 -> 14
        assert qm["servers"] == 14

    def test_low_evidence_bank_gets_insufficient_data_not_a_crash(self):
        rows = [{
            "scheduled_hour": 3,
            "scheduled_departures": 1.0,
            "completed_departures": 1.0,
            "delayed_departures": 0.0,
            "avg_departure_delay": 5.0,
            "avg_taxi_out": None,
            "effective_capacity": 0.0,
            "mean_taxi_out": None,
            "stddev_taxi_out": None,
            "observed_days": 2,
        }]
        banks = score_departure_banks(rows)
        assert banks[0]["evidence_sufficient"] is False
        assert banks[0]["queueing_model"]["status"] == "insufficient_data"
