"""
Tests for the Markov-chain delay propagation model (Phase 3 of the OR/
statistics upgrade roadmap, api/delay_propagation_markov.py). This is
additive to the existing correlation-based /api/delay-propagation, not a
replacement -- these tests check the NEW machinery (transition matrix
construction, matrix-power multi-step forecasting), not the correlation
endpoint, which already has its own established behavior.
"""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.delay_propagation_markov import (
    STATES,
    STATE_INDEX,
    build_transition_matrices,
    multi_step_distribution,
)


class TestTransitionMatrixIsRowStochastic:
    def test_every_row_sums_to_one(self):
        """A real transition matrix must be row-stochastic -- every row's
        probabilities sum to exactly 1 (each state must transition
        SOMEWHERE, including possibly back to itself)."""
        counts = [
            {"from_state": "on_time", "to_state": "on_time", "turnaround_bucket": "normal", "n": 80},
            {"from_state": "on_time", "to_state": "minor", "turnaround_bucket": "normal", "n": 15},
            {"from_state": "on_time", "to_state": "moderate", "turnaround_bucket": "normal", "n": 4},
            {"from_state": "on_time", "to_state": "severe", "turnaround_bucket": "normal", "n": 1},
            {"from_state": "severe", "to_state": "on_time", "turnaround_bucket": "normal", "n": 5},
            {"from_state": "severe", "to_state": "minor", "turnaround_bucket": "normal", "n": 10},
            {"from_state": "severe", "to_state": "moderate", "turnaround_bucket": "normal", "n": 20},
            {"from_state": "severe", "to_state": "severe", "turnaround_bucket": "normal", "n": 65},
        ]
        matrices = build_transition_matrices(counts)
        matrix = matrices["normal"]["matrix"]
        row_sums = matrix.sum(axis=1)
        np.testing.assert_allclose(row_sums, np.ones(len(STATES)), atol=1e-9)

    def test_zero_observations_row_falls_back_to_identity_not_nan(self):
        """A from_state with zero observed transitions in a bucket must not
        produce NaN (division by zero) -- falls back to staying in the same
        state with probability 1, flagged low_confidence."""
        counts = [
            {"from_state": "on_time", "to_state": "on_time", "turnaround_bucket": "tight", "n": 10},
        ]
        matrices = build_transition_matrices(counts)
        matrix = matrices["tight"]["matrix"]
        assert not np.isnan(matrix).any()
        # "severe" had zero observations in this bucket -- identity row
        severe_idx = STATE_INDEX["severe"]
        assert matrix[severe_idx, severe_idx] == 1.0
        assert "severe" in matrices["tight"]["low_confidence_rows"]

    def test_thin_row_flagged_low_confidence_even_when_nonzero(self):
        counts = [
            {"from_state": "on_time", "to_state": "on_time", "turnaround_bucket": "loose", "n": 3},
            {"from_state": "on_time", "to_state": "minor", "turnaround_bucket": "loose", "n": 2},
        ]
        matrices = build_transition_matrices(counts)
        assert "on_time" in matrices["loose"]["low_confidence_rows"]  # only 5 total, below the 20-pair floor


class TestMultiStepForecastMatchesHandComputedToyExample:
    def test_two_state_chain_matrix_power(self):
        """Hand-computable toy: a 2-state chain (borrowing 2 of the 4 real
        state slots) with a known transition matrix -- verify the
        multi-step forecast matches manually-computed matrix powers, not
        just numpy's own matrix_power (which would be a tautological test).

        P = [[0.9, 0.1],
             [0.2, 0.8]]   (rows: on_time, minor; using only these 2 states)

        Starting at on_time, after 2 steps:
        P^2 = P @ P = [[0.9*0.9+0.1*0.2, 0.9*0.1+0.1*0.8],
                       [0.2*0.9+0.8*0.2, 0.2*0.1+0.8*0.8]]
            = [[0.83, 0.17],
               [0.34, 0.66]]
        So P(on_time after 2 steps | start on_time) = 0.83, hand-computed."""
        full_matrix = np.eye(len(STATES))
        i_on_time, i_minor = STATE_INDEX["on_time"], STATE_INDEX["minor"]
        full_matrix[i_on_time, i_on_time] = 0.9
        full_matrix[i_on_time, i_minor] = 0.1
        full_matrix[i_minor, i_on_time] = 0.2
        full_matrix[i_minor, i_minor] = 0.8

        result = multi_step_distribution(full_matrix, "on_time", n_steps=2)
        assert abs(result["on_time"] - 0.83) < 1e-9
        assert abs(result["minor"] - 0.17) < 1e-9

    def test_one_step_forecast_equals_the_transition_matrix_row_directly(self):
        counts = [
            {"from_state": "moderate", "to_state": "on_time", "turnaround_bucket": "normal", "n": 10},
            {"from_state": "moderate", "to_state": "minor", "turnaround_bucket": "normal", "n": 20},
            {"from_state": "moderate", "to_state": "moderate", "turnaround_bucket": "normal", "n": 40},
            {"from_state": "moderate", "to_state": "severe", "turnaround_bucket": "normal", "n": 30},
        ]
        matrices = build_transition_matrices(counts)
        matrix = matrices["normal"]["matrix"]
        forecast = multi_step_distribution(matrix, "moderate", n_steps=1)
        assert forecast == {"on_time": 0.1, "minor": 0.2, "moderate": 0.4, "severe": 0.3}

    def test_multi_step_distribution_always_sums_to_one(self):
        """A probability distribution over states must sum to 1 at any
        forecast horizon -- probability mass can't leak or be created."""
        counts = [
            {"from_state": s, "to_state": t, "turnaround_bucket": "normal", "n": 25}
            for s in STATES for t in STATES
        ]
        matrices = build_transition_matrices(counts)
        matrix = matrices["normal"]["matrix"]
        for n_steps in (1, 2, 3, 5):
            forecast = multi_step_distribution(matrix, "severe", n_steps=n_steps)
            assert abs(sum(forecast.values()) - 1.0) < 1e-9

    def test_absorbing_state_stays_absorbing_across_steps(self):
        """If a state transitions to itself with probability 1 (e.g. the
        zero-observation identity fallback), it must remain there at any
        forecast horizon -- a basic Markov chain sanity property."""
        counts = [
            {"from_state": "on_time", "to_state": "on_time", "turnaround_bucket": "tight", "n": 50},
        ]
        matrices = build_transition_matrices(counts)
        matrix = matrices["tight"]["matrix"]
        for n_steps in (1, 3, 6):
            forecast = multi_step_distribution(matrix, "severe", n_steps=n_steps)  # severe had zero data -> identity
            assert forecast["severe"] == 1.0
