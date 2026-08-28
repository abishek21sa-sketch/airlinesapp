"use client";

import { Health } from "../lib/health";

const RATING_COLORS: Record<string, string> = {
  Excellent: "#4f9d8f",
  Strong: "#7fb069",
  Watch: "#e8a33d",
  Weak: "#d17b3e",
  Critical: "#c9563a",
};

const COMPONENT_LABELS: Record<string, string> = {
  reliability: "Reliability",
  delay_severity: "Delay severity",
  severe_delay_exposure: "Severe-delay exposure",
  cancellation_resilience: "Cancellation resilience",
  diversion_resilience: "Diversion resilience",
};

const COMPONENT_FORMULAS: Record<string, string> = {
  reliability: "on-time rate, as-is",
  delay_severity: "100 minus (avg arrival delay \u00d7 2)",
  severe_delay_exposure: "100 minus (% of flights delayed over 60 min \u00d7 5)",
  cancellation_resilience: "100 minus (cancellation rate \u00d7 10)",
  diversion_resilience: "100 minus (diversion rate \u00d7 20)",
};

export default function HealthBadge({ health }: { health: Health | null }) {
  if (!health) return null;

  const color = RATING_COLORS[health.rating] ?? "#9099a8";
  const componentKeys = Object.keys(health.component_scores) as Array<keyof typeof health.component_scores>;

  return (
    <div className="health-badge">
      <div className="health-badge-main">
        <div className="health-score-circle" style={{ borderColor: color, color }}>
          {health.score.toFixed(0)}
        </div>
        <div>
          <p className="eyebrow" style={{ marginBottom: "0.2rem" }}>Health score</p>
          <p className="health-rating" style={{ color }}>{health.rating}</p>
          {health.confidence_interval_95 && (
            <p className="health-sample-note">
              95% confidence interval: {health.confidence_interval_95[0].toFixed(1)}
              {"–"}
              {health.confidence_interval_95[1].toFixed(1)}
              {" "}({health.sample.total_flights.toLocaleString()} flights)
            </p>
          )}
          {health.sample.status === "limited" && (
            <p className="health-sample-note">
              Small sample ({health.sample.total_flights.toLocaleString()} flights, under {health.sample.minimum_for_full_confidence}) &mdash; interpret with caution.
            </p>
          )}
        </div>
      </div>

      <div className="health-components">
        {componentKeys.map((key) => {
          const value = health.component_scores[key];
          const weight = health.weights[key];
          const pointsEarned = value * weight;
          const pointsPossible = 100 * weight;
          return (
            <div key={key} className="health-component-row">
              <span className="health-component-label">{COMPONENT_LABELS[key] ?? key}</span>
              <div className="health-component-bar-track">
                <div
                  className="health-component-bar-fill"
                  style={{ width: `${value}%`, background: RATING_COLORS[
                    value >= 90 ? "Excellent" : value >= 80 ? "Strong" : value >= 70 ? "Watch" : value >= 60 ? "Weak" : "Critical"
                  ] }}
                />
              </div>
              <span className="health-component-value">{value.toFixed(0)}</span>
              <span className="health-component-points">
                {pointsEarned.toFixed(1)}/{pointsPossible.toFixed(1)} pts
              </span>
            </div>
          );
        })}
      </div>
      <p className="page-note" style={{ marginTop: "0.4rem" }}>
        Points shown are each component&apos;s actual contribution to the overall 100-point
        score, out of the maximum it could contribute given its weight &mdash; the five
        maximums (29.0, 25.1, 27.5, 12.5, 5.9) sum to exactly 100, and the five earned amounts
        sum to the Health Score itself.
      </p>

      <details className="health-methodology">
        <summary>How this is calculated</summary>
        <div className="health-methodology-body">
          <p>
            Five components on a 0&ndash;100 scale, combined into one weighted score.
            The weights below are <strong>not hand-picked</strong> &mdash; each one is
            that component&apos;s real-world correlation with actual future
            performance, empirically measured and normalized to sum to 1.0.
          </p>
          <ul>
            {componentKeys.map((key) => (
              <li key={key}>
                <strong>{COMPONENT_LABELS[key]} ({(health.weights[key] * 100).toFixed(1)}%)</strong>
                {" \u2014 "}{COMPONENT_FORMULAS[key]}.
              </li>
            ))}
          </ul>
          <p>
            <strong>How the weights were derived:</strong> {health.calibration.method} Tested
            across {health.calibration.sample_size_routes.toLocaleString()} real routes by
            splitting each route&apos;s history chronologically, computing each component
            from the earlier period, then checking how strongly it predicted that same
            route&apos;s actual on-time rate in the later period.
          </p>
          <ul>
            {componentKeys.map((key) => (
              <li key={key}>
                {COMPONENT_LABELS[key]}: r = {health.calibration.correlations_with_future_performance[key] >= 0 ? "+" : ""}
                {health.calibration.correlations_with_future_performance[key].toFixed(3)} with future on-time rate
              </li>
            ))}
          </ul>
          <p>
            None of these correlations are close to 1.0 &mdash; past performance is a real
            signal, not a guarantee. Routes, airports, and carriers do change over time.
          </p>
          <p>
            <strong>The 95% confidence interval:</strong> every component above is a sample
            mean or proportion over a finite number of flights, so it carries real sampling
            uncertainty &mdash; computed from each component&apos;s actual variance in this
            data, not assumed. On a whole carrier ({health.sample.total_flights.toLocaleString()}{" "}
            flights here), that interval is usually tight enough to ignore. On a single route,
            a single day, or any other small slice, it can span several points &mdash; check it
            before treating a small gap between two scores as a real difference.
          </p>
          <p>
            Rating bands: 90+ Excellent, 80+ Strong, 70+ Watch, 60+ Weak, under 60 Critical.
            Cancelled and diverted flights are excluded from the delay-based components
            (reliability, delay severity, severe-delay exposure) since they have no arrival
            delay to measure &mdash; they&apos;re captured instead in their own dedicated
            components.
          </p>
          <p>
            <a href="/methodology" className="health-methodology-link">
              Read the full plain-language explanation, formulas, and a worked example &rarr;
            </a>
          </p>
        </div>
      </details>
    </div>
  );
}
