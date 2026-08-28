// Canonical Health type -- the ONE shared shape for the health-score object
// returned by the backend across carrier/airport/aircraft/route detail
// endpoints. Previously redefined independently in four different files
// (HealthBadge.tsx, routes/page.tsx, aircraft/page.tsx, EntityCompare.tsx),
// each slightly different -- routes/page.tsx was missing weights/calibration
// entirely, aircraft/page.tsx had a looser correlations_with_future_performance
// type. TypeScript correctly flagged these as structurally incompatible the
// first time a real `tsc`/`next build` ran against this code. Fixed by
// having every file import this one definition instead of redeclaring it.

export type Health = {
  score: number;
  rating: string;
  standard_error: number;
  confidence_interval_95: [number, number];
  sample: {
    total_flights: number;
    completed_flights: number;
    minimum_for_full_confidence: number;
    status: string;
  };
  component_scores: {
    reliability: number;
    delay_severity: number;
    severe_delay_exposure: number;
    cancellation_resilience: number;
    diversion_resilience: number;
  };
  component_standard_errors: {
    reliability: number;
    delay_severity: number;
    severe_delay_exposure: number;
    cancellation_resilience: number;
    diversion_resilience: number;
  };
  weights: {
    reliability: number;
    delay_severity: number;
    severe_delay_exposure: number;
    cancellation_resilience: number;
    diversion_resilience: number;
  };
  calibration: {
    method: string;
    sample_size_routes: number;
    correlations_with_future_performance: {
      reliability: number;
      delay_severity: number;
      severe_delay_exposure: number;
      cancellation_resilience: number;
      diversion_resilience: number;
    };
  };
};

// A genuinely smaller need (e.g. a compact comparison-table cell that only
// ever shows score + rating) -- an explicit, self-documenting subset rather
// than another full redeclaration.
export type HealthSummary = Pick<Health, "score" | "rating">;
