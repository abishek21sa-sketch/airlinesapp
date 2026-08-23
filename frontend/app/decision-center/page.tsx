"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CARRIER_NAMES, carrierName } from "../lib/carriers";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

const CARRIER_CODES = Object.keys(CARRIER_NAMES);

const COMPONENT_LABELS: Record<string, string> = {
  reliability: "Reliability",
  delay_severity: "Delay severity",
  severe_delay_exposure: "Severe-delay exposure",
  cancellation_resilience: "Cancellation resilience",
  diversion_resilience: "Diversion resilience",
};

const FEATURE_LABELS: Record<string, string> = {
  severe_delay_rate: "Severe-delay rate",
  cancellation_rate: "Cancellation rate",
  average_departure_delay: "Avg departure delay",
  late_aircraft_delay_share: "Late-aircraft delay share",
  ground_delay_share: "Ground-time share",
  log_flight_volume: "Flight volume (log)",
  trend_severe_delay_rate: "Recent trend (vs. last 3 months)",
  seasonal_index: "Seasonal pattern (this calendar month, historically)",
};

type Lever = {
  component: string;
  current_value: number;
  network_median: number;
  weight: number;
  hypothetical_score_if_at_median: number;
  point_gain: number;
};

type LeverResult = {
  carrier: string;
  current_score: number;
  current_rating: string;
  peer_count: number;
  levers: Lever[];
};

type ScenarioCell = {
  turnaround_bucket: string;
  predecessor_bucket: string;
  pairs: number;
  avg_successor_dep_delay: number;
};

type ScenarioResult = {
  carrier: string | null;
  tight_turnaround_minutes: number;
  target_turnaround_minutes: number;
  cells: ScenarioCell[];
};

type RankingEntry = {
  carrier: string;
  current_score: number;
  current_rating: string;
  total_flights: number;
  top_lever_component: string;
  top_lever_current_value: number;
  top_lever_network_median: number;
  top_lever_point_gain: number;
};

type RankingResult = {
  peer_count: number;
  carriers: RankingEntry[];
};

type CalibrationBin = {
  probability_band: string;
  count: number;
  mean_predicted_probability: number;
  observed_risk_rate: number;
};

type Metrics = {
  examples: number;
  positive_rate: number;
  brier_score: number;
  log_loss: number;
  precision_recall_auc: number;
  calibration_bins: CalibrationBin[];
};

type Coefficient = {
  feature: string;
  standardized_coefficient: number;
  direction: "higher_risk" | "lower_risk";
};

type CentralityEntry = { airport: string; value: number };

type NetworkResilienceResult = {
  scope: { minimum_flights_per_route: number; airport_count: number; route_count: number };
  degree_centrality: { top_by_route_count: CentralityEntry[]; top_by_flight_volume: CentralityEntry[] };
  betweenness_centrality: { top_structural_bridges: CentralityEntry[] };
  methodology: { combination_policy: string; limitations: string[] };
};

type RiskResult = {
  entity_type: string;
  entity: string;
  as_of_period: string;
  risk_probability: number;
  risk_band: string;
  risk_threshold_definition: string;
  current_features: Record<string, number>;
  model_coefficients: Coefficient[];
  split: {
    train_end: string; validation_end: string;
    train_examples: number; validation_examples: number; test_examples: number;
  };
  validation_metrics: Metrics;
  test_metrics: Metrics;
  entities_in_training_panel: number;
};

const TURNAROUND_ROWS = ["Tight", "Normal", "Loose"];
const PREDECESSOR_COLS = ["On time or early", "Late (1-60 min)", "Very late (60+ min)"];

function scoreColor(score: number): string {
  if (score >= 80) return "#4f9d8f";
  if (score >= 65) return "#e8a33d";
  return "#c9563a";
}

function delayColor(minutes: number): string {
  if (minutes <= 15) return "#4f9d8f";
  if (minutes <= 45) return "#e8a33d";
  return "#c9563a";
}

// Genuinely derives a verdict from the actual cell values -- doesn't force
// a clean story where the data doesn't show one. If the same turnaround
// bucket has the lowest average knock-on delay at every inbound-delay
// level, that's a real, consistent pattern worth stating plainly. If it's
// mixed, saying so honestly is more useful than papering over it.
function deriveScenarioVerdict(result: ScenarioResult): string | null {
  const winners: Record<string, string> = {};
  for (const col of PREDECESSOR_COLS) {
    let best: ScenarioCell | null = null;
    for (const row of TURNAROUND_ROWS) {
      const cell = result.cells.find((c) => c.turnaround_bucket === row && c.predecessor_bucket === col);
      if (cell && (!best || cell.avg_successor_dep_delay < best.avg_successor_dep_delay)) {
        best = cell;
      }
    }
    if (best) winners[col] = best.turnaround_bucket;
  }

  const distinctWinners = new Set(Object.values(winners));
  if (distinctWinners.size === 0) return null;

  if (distinctWinners.size === 1) {
    const winner = [...distinctWinners][0];
    return `Consistent pattern: ${winner.toLowerCase()} turnarounds show the lowest average knock-on delay at every inbound-delay level in this data -- not just on average, but at each of the three levels checked separately.`;
  }

  const parts = PREDECESSOR_COLS.filter((c) => winners[c]).map(
    (c) => `${winners[c].toLowerCase()} does best when the inbound flight was ${c.toLowerCase()}`
  );
  return `Mixed pattern, not a clean story: ${parts.join("; ")}. No single turnaround type wins across every inbound-delay level here.`;
}

// Surfaces the real tension between "biggest arithmetic gap" and "biggest
// flight volume" rather than picking one number and calling it "priority"
// -- those are two different, independently true facts, and which matters
// more is a judgment call this function doesn't make for the reader.
function deriveRankingVerdict(result: RankingResult): string | null {
  if (result.carriers.length === 0) return null;
  const topGain = result.carriers[0];
  const topThree = result.carriers.slice(0, 3);
  const topVolume = topThree.reduce((a, b) => (b.total_flights > a.total_flights ? b : a));

  if (topGain.carrier === topVolume.carrier) {
    return `${carrierName(topGain.carrier)} has both the largest single-component opportunity in the network (+${topGain.top_lever_point_gain.toFixed(1)} points via ${COMPONENT_LABELS[topGain.top_lever_component]}) and the highest flight volume among the top three by gain -- the clearest starting point of these three, on this measure alone.`;
  }

  const ratio = topVolume.total_flights / topGain.total_flights;
  return `${carrierName(topGain.carrier)} has the largest single-component opportunity (+${topGain.top_lever_point_gain.toFixed(1)} points via ${COMPONENT_LABELS[topGain.top_lever_component]}), but only ${topGain.total_flights.toLocaleString()} flights behind it. ${carrierName(topVolume.carrier)}'s smaller gap (+${topVolume.top_lever_point_gain.toFixed(1)} points) touches ${topVolume.total_flights.toLocaleString()} flights -- ${ratio.toFixed(1)}x more. Which matters more depends on whether you're optimizing for the cleanest fix or the widest reach, which this can't decide for you.`;
}

export default function DecisionCenterPage() {
  const [tab, setTab] = useState<"levers" | "scenario" | "ranking" | "risk" | "bank" | "portfolio" | "resilience">("levers");
  const [carrierInput, setCarrierInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  const [leverResult, setLeverResult] = useState<LeverResult | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [rankingResult, setRankingResult] = useState<RankingResult | null>(null);
  const [portfolioBudget, setPortfolioBudget] = useState<number | null>(3);

  const [riskEntityType, setRiskEntityType] = useState<"carrier" | "airport">("carrier");
  const [riskEntity, setRiskEntity] = useState("");
  const [airportOptions, setAirportOptions] = useState<string[]>([]);
  const [riskResult, setRiskResult] = useState<RiskResult | null>(null);

  const [bankAirport, setBankAirport] = useState("");
  const [bankCarrier, setBankCarrier] = useState("");
  const [bankWindowStart, setBankWindowStart] = useState(6);
  const [bankWindowEnd, setBankWindowEnd] = useState(10);
  const [bankShift, setBankShift] = useState(30);
  const [bankMode, setBankMode] = useState<"expected" | "risk_averse">("expected");
  const [bankSeasonalYears, setBankSeasonalYears] = useState(3);
  const [bankResult, setBankResult] = useState<any>(null);

  const [portfolioType, setPortfolioType] = useState<"carrier" | "airport">("carrier");
  const [portfolioBudgetInput, setPortfolioBudgetInput] = useState(3);
  const [portfolioMetric, setPortfolioMetric] = useState("severe_delay_exposure");
  const [portfolioResult, setPortfolioResult] = useState<any>(null);

  const [resilienceMinFlights, setResilienceMinFlights] = useState(50);
  const [resilienceResult, setResilienceResult] = useState<NetworkResilienceResult | null>(null);

  useEffect(() => {
    if ((riskEntityType === "airport" || tab === "bank") && airportOptions.length === 0) {
      fetch(`${API_BASE}/api/airports/list`)
        .then((r) => r.json())
        .then((data) => setAirportOptions(data.airports ?? []))
        .catch(() => setAirportOptions([]));
    }
  }, [riskEntityType, airportOptions.length, tab]);

  function resetResults() {
    setLeverResult(null);
    setScenarioResult(null);
    setRankingResult(null);
    setRiskResult(null);
    setBankResult(null);
    setPortfolioResult(null);
    setResilienceResult(null);
    setNotFound(false);
    setError(false);
  }

  async function analyze() {
    if (tab === "levers" || tab === "scenario") {
      if (!carrierInput) return;
    } else if (tab === "risk") {
      if (!riskEntity) return;
    } else if (tab === "bank") {
      if (!bankAirport) return;
    }
    setLoading(true);
    setNotFound(false);
    setError(false);
    try {
      if (tab === "levers") {
        const res = await fetch(`${API_BASE}/api/decision/health-improvement?carrier=${encodeURIComponent(carrierInput)}`);
        if (res.status === 404) { setLeverResult(null); setNotFound(true); return; }
        if (!res.ok) throw new Error("not ok");
        setLeverResult(await res.json());
      } else if (tab === "scenario") {
        const res = await fetch(`${API_BASE}/api/decision/propagation-scenario?carrier=${encodeURIComponent(carrierInput)}`);
        if (res.status === 404) { setScenarioResult(null); setNotFound(true); return; }
        if (!res.ok) throw new Error("not ok");
        setScenarioResult(await res.json());
      } else if (tab === "risk") {
        const res = await fetch(`${API_BASE}/api/decision/predictive-risk?entity_type=${riskEntityType}&entity=${encodeURIComponent(riskEntity)}`);
        if (res.status === 404) { setRiskResult(null); setNotFound(true); return; }
        if (!res.ok) throw new Error("not ok");
        setRiskResult(await res.json());
      } else if (tab === "bank") {
        const params = new URLSearchParams({
          airport: bankAirport,
          window_start_hour: String(bankWindowStart), window_end_hour: String(bankWindowEnd),
          allowed_shift_minutes: String(bankShift), mode: bankMode,
          seasonal_lookback_years: String(bankSeasonalYears),
        });
        if (bankCarrier) params.set("carrier", bankCarrier);
        const res = await fetch(`${API_BASE}/api/decision/departure-bank-smoothing?${params}`);
        if (res.status === 404) { setBankResult(null); setNotFound(true); return; }
        if (!res.ok) throw new Error("not ok");
        setBankResult(await res.json());
      } else if (tab === "portfolio") {
        const params = new URLSearchParams({
          candidate_type: portfolioType, budget: String(portfolioBudgetInput), primary_metric: portfolioMetric,
        });
        const res = await fetch(`${API_BASE}/api/decision/network-protection-portfolio?${params}`);
        if (!res.ok) throw new Error("not ok");
        setPortfolioResult(await res.json());
      } else if (tab === "resilience") {
        const res = await fetch(`${API_BASE}/api/decision/network-resilience?minimum_flights=${resilienceMinFlights}`);
        if (!res.ok) throw new Error("not ok");
        setResilienceResult(await res.json());
      } else {
        const res = await fetch(`${API_BASE}/api/decision/opportunity-ranking`);
        if (!res.ok) throw new Error("not ok");
        setRankingResult(await res.json());
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const topLever = leverResult?.levers?.[0];

  function scenarioCell(turnaround: string, predecessor: string): ScenarioCell | undefined {
    return scenarioResult?.cells.find(
      (c) => c.turnaround_bucket === turnaround && c.predecessor_bucket === predecessor
    );
  }

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">DOT On-Time Performance &middot; Decision Center</p>
        <h1 className="title">Decision Center</h1>
        <p className="subtitle">
          Built entirely on relationships already calibrated or measured elsewhere on this site
          (see <Link href="/methodology">Methodology</Link>) &mdash; not new predictive models.
        </p>
      </header>

      <div className="sort-toggle" style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          className={tab === "levers" ? "sort-toggle-active" : ""}
          onClick={() => { setTab("levers"); resetResults(); }}
        >
          Health Score Levers
        </button>
        <button
          type="button"
          className={tab === "scenario" ? "sort-toggle-active" : ""}
          onClick={() => { setTab("scenario"); resetResults(); }}
        >
          Turnaround Scenarios
        </button>
        <button
          type="button"
          className={tab === "ranking" ? "sort-toggle-active" : ""}
          onClick={() => { setTab("ranking"); resetResults(); }}
        >
          Network Opportunity Ranking
        </button>
        <button
          type="button"
          className={tab === "risk" ? "sort-toggle-active" : ""}
          onClick={() => { setTab("risk"); resetResults(); }}
        >
          Predictive Risk Screen
        </button>
        <button
          type="button"
          className={tab === "bank" ? "sort-toggle-active" : ""}
          onClick={() => { setTab("bank"); resetResults(); }}
        >
          Departure Bank Smoothing
        </button>
        <button
          type="button"
          className={tab === "portfolio" ? "sort-toggle-active" : ""}
          onClick={() => { setTab("portfolio"); resetResults(); }}
        >
          Network Protection Portfolio
        </button>
        <button
          type="button"
          className={tab === "resilience" ? "sort-toggle-active" : ""}
          onClick={() => { setTab("resilience"); resetResults(); }}
        >
          Network Resilience Ranking
        </button>
      </div>

      <section className="section" style={{ marginTop: 0 }}>
        <div className="screen">
          {tab === "levers" && (
            <>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is:</strong> for each of the five Health Score components, this
                shows what the overall score would become if that ONE component moved to the
                current network median for that carrier&apos;s peers &mdash; holding everything
                else exactly as it is now.
              </p>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is not:</strong> a prediction of what would actually happen if a
                carrier changed anything, or a claim about how easy or hard any given component is
                to move &mdash; only the arithmetic leverage in the scoring formula.
              </p>
            </>
          )}
          {tab === "scenario" && (
            <>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is:</strong> for same-day, same-tail flight pairs, the actual
                average departure delay of the SECOND flight, broken down by how tight the
                scheduled turnaround was and how late the FIRST flight arrived. Every number here
                is something that really happened in the data.
              </p>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is not:</strong> a prediction of what would happen if a carrier
                changed its turnaround policy. These are historical averages under the conditions
                that actually occurred, not a model of cause and effect &mdash; carriers likely
                don&apos;t assign tight turnarounds at random (see{" "}
                <Link href="/delays">Delays</Link> for the full discussion).
              </p>
            </>
          )}
          {tab === "ranking" && (
            <>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is:</strong> unlike the other two tabs, this doesn&apos;t need a
                carrier picked first &mdash; it ranks every carrier&apos;s single biggest Health
                Score lever, network-wide, so you can see where the largest opportunities are
                before deciding what to look into further.
              </p>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is not:</strong> a single "priority score." Point gain (arithmetic
                opportunity) and flight volume (real-world reach) are shown separately on purpose
                &mdash; multiplying them into one number would look more rigorous than it actually
                is. Which one should drive a decision is a real judgment call this doesn&apos;t
                make for you.
              </p>
            </>
          )}
          {tab === "risk" && (
            <>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is:</strong> a real trained model, not a hand-picked formula.
                Six current-month features (severe-delay rate, cancellation rate, average
                departure delay, late-aircraft share, ground-time share, flight volume) predict
                whether NEXT month's severe-delay rate lands in the network's worst quartile.
                Trained on a chronological split (train/validate/test by date, never mixed) and
                calibrated so the probability actually means what it says &mdash; both the
                model's real test-set performance and its calibration accuracy are shown below,
                not hidden.
              </p>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is not:</strong> a certainty. Every model here is retrained
                fresh from real flight-level aggregates on each request &mdash; check the sample
                sizes and precision-recall AUC before trusting the number. A small test set or
                weak AUC means take the risk band as a rough signal, not a verdict.
              </p>
            </>
          )}

          {tab === "bank" && (
            <>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is:</strong> a real optimizer, not a suggestion engine. Given a
                departure bank at one airport, it decides whether shifting some flights by a small,
                bounded amount (&plusmn;15/30/45 min) would meaningfully reduce how crowded the
                busiest 15-minute slot gets. Solved as an actual MILP (mixed-integer linear
                program) via an open-source solver &mdash; every flight either moves or doesn&apos;t,
                nothing fuzzy about it. The congestion baseline is seasonal by default &mdash; it
                compares this window against the SAME calendar window in prior years (Thanksgiving
                vs. prior Thanksgivings, September vs. prior Septembers), not just this window
                against itself, which would be circular if the window being analyzed is already an
                elevated period.
              </p>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is not:</strong> a claim about certified airport capacity. BTS
                doesn&apos;t provide that, so this uses historical load as the congestion signal,
                labeled as such throughout. It also only rearranges flights already in the dataset
                &mdash; it can&apos;t add, cancel, or move flights across carriers.
              </p>
            </>
          )}

          {tab === "portfolio" && (
            <>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is:</strong> if you can only focus resources on a few
                carriers or airports, which ones give the most real coverage for the budget? A
                real 0/1 knapsack optimization &mdash; pick the metric that matters to you
                (severe-delay exposure, cancellation resilience, volume, etc.), and it selects the
                best-value combination under your budget. Every OTHER metric is still reported for
                whatever gets selected, so nothing is hidden inside one invented priority score.
              </p>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is not:</strong> a claim that intervening will produce a
                specific improvement &mdash; it's an allocation tool over real, disclosed
                historical metrics, not a causal guarantee.
              </p>
            </>
          )}

          {tab === "resilience" && (
            <>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is:</strong> a real directed graph &mdash; airports as nodes,
                routes as edges &mdash; built from the whole network, not just the busiest routes.
                Reports two genuinely different, separately-computed measures: raw hub-ness
                (connection count and traffic volume) and betweenness centrality (what fraction of
                shortest paths between OTHER airport pairs run through this one). An airport can
                rank low on volume but high on betweenness if it's a structural bridge with few
                alternate routes around it &mdash; that's the actual point of computing it
                separately rather than folding it into one score.
              </p>
              <p className="page-note" style={{ marginBottom: "1rem" }}>
                <strong>What this is not:</strong> a simulation of what actually happens to the
                network if an airport closes &mdash; betweenness is a structural proxy, not a
                literal removal-and-resimulate model.
              </p>
            </>
          )}

          {(tab === "levers" || tab === "scenario") && (
            <div className="route-lookup-row">
              <label className="filter-field">
                <span className="filter-label">Carrier</span>
                <select value={carrierInput} onChange={(e) => setCarrierInput(e.target.value)}>
                  <option value="">Select carrier</option>
                  {CARRIER_CODES.map((code) => (
                    <option key={code} value={code}>{code} &mdash; {carrierName(code)}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="compare-run"
                onClick={analyze}
                disabled={!carrierInput || loading}
              >
                {loading ? "Analyzing..." : "Analyze"}
              </button>
            </div>
          )}
          {tab === "ranking" && (
            <button
              type="button"
              className="compare-run"
              onClick={analyze}
              disabled={loading}
            >
              {loading ? "Ranking..." : "Rank the network"}
            </button>
          )}
          {tab === "risk" && (
            <div className="route-lookup-row">
              <label className="filter-field">
                <span className="filter-label">Entity type</span>
                <select
                  value={riskEntityType}
                  onChange={(e) => { setRiskEntityType(e.target.value as "carrier" | "airport"); setRiskEntity(""); }}
                >
                  <option value="carrier">Carrier</option>
                  <option value="airport">Airport</option>
                </select>
              </label>
              <label className="filter-field">
                <span className="filter-label">{riskEntityType === "carrier" ? "Carrier" : "Airport"}</span>
                <select value={riskEntity} onChange={(e) => setRiskEntity(e.target.value)}>
                  <option value="">Select {riskEntityType}</option>
                  {riskEntityType === "carrier"
                    ? CARRIER_CODES.map((code) => (
                        <option key={code} value={code}>{code} &mdash; {carrierName(code)}</option>
                      ))
                    : airportOptions.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="compare-run"
                onClick={analyze}
                disabled={!riskEntity || loading}
              >
                {loading ? "Training model..." : "Screen risk"}
              </button>
            </div>
          )}

          {tab === "bank" && (
            <div className="route-lookup-row" style={{ flexWrap: "wrap" }}>
              <label className="filter-field">
                <span className="filter-label">Airport</span>
                <select value={bankAirport} onChange={(e) => setBankAirport(e.target.value)}>
                  <option value="">Select airport</option>
                  {airportOptions.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span className="filter-label">Carrier (optional)</span>
                <select value={bankCarrier} onChange={(e) => setBankCarrier(e.target.value)}>
                  <option value="">All carriers</option>
                  {CARRIER_CODES.map((code) => (
                    <option key={code} value={code}>{code} &mdash; {carrierName(code)}</option>
                  ))}
                </select>
              </label>
              <label className="filter-field">
                <span className="filter-label">Window start (hour)</span>
                <select value={bankWindowStart} onChange={(e) => setBankWindowStart(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span className="filter-label">Window end (hour)</span>
                <select value={bankWindowEnd} onChange={(e) => setBankWindowEnd(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span className="filter-label">Allowed shift</span>
                <select value={bankShift} onChange={(e) => setBankShift(Number(e.target.value))}>
                  <option value={15}>&plusmn;15 min</option>
                  <option value={30}>&plusmn;30 min</option>
                  <option value={45}>&plusmn;45 min</option>
                </select>
              </label>
              <label className="filter-field">
                <span className="filter-label">Mode</span>
                <select value={bankMode} onChange={(e) => setBankMode(e.target.value as "expected" | "risk_averse")}>
                  <option value="expected">Expected</option>
                  <option value="risk_averse">Risk-averse (CVaR)</option>
                </select>
              </label>
              <label className="filter-field">
                <span className="filter-label">Seasonal baseline</span>
                <select value={bankSeasonalYears} onChange={(e) => setBankSeasonalYears(Number(e.target.value))}>
                  <option value={0}>Off (this window only)</option>
                  <option value={1}>1 prior year</option>
                  <option value={3}>3 prior years</option>
                  <option value={5}>5 prior years</option>
                </select>
              </label>
              <button
                type="button"
                className="compare-run"
                onClick={analyze}
                disabled={!bankAirport || loading}
              >
                {loading ? "Solving..." : "Optimize this bank"}
              </button>
            </div>
          )}

          {tab === "portfolio" && (
            <div className="route-lookup-row">
              <label className="filter-field">
                <span className="filter-label">Candidate type</span>
                <select value={portfolioType} onChange={(e) => setPortfolioType(e.target.value as "carrier" | "airport")}>
                  <option value="carrier">Carrier</option>
                  <option value="airport">Airport</option>
                </select>
              </label>
              <label className="filter-field">
                <span className="filter-label">Budget (# of interventions)</span>
                <input
                  type="number" min={1} max={20} value={portfolioBudgetInput}
                  onChange={(e) => setPortfolioBudgetInput(Number(e.target.value))}
                  style={{ width: "5rem" }}
                />
              </label>
              <label className="filter-field">
                <span className="filter-label">Optimize for</span>
                <select value={portfolioMetric} onChange={(e) => setPortfolioMetric(e.target.value)}>
                  <option value="severe_delay_exposure">Severe-delay exposure</option>
                  <option value="reliability">Reliability</option>
                  <option value="delay_severity">Delay severity</option>
                  <option value="cancellation_resilience">Cancellation resilience</option>
                  <option value="diversion_resilience">Diversion resilience</option>
                  <option value="total_flights_millions">Total flight volume</option>
                </select>
              </label>
              <button type="button" className="compare-run" onClick={analyze} disabled={loading}>
                {loading ? "Solving..." : "Build portfolio"}
              </button>
            </div>
          )}

          {tab === "resilience" && (
            <div className="route-lookup-row">
              <label className="filter-field">
                <span className="filter-label">Minimum flights per route</span>
                <input
                  type="number" min={1} max={5000} value={resilienceMinFlights}
                  onChange={(e) => setResilienceMinFlights(Number(e.target.value))}
                  style={{ width: "6rem" }}
                />
              </label>
              <button type="button" className="compare-run" onClick={analyze} disabled={loading}>
                {loading ? "Computing..." : "Rank network"}
              </button>
            </div>
          )}

          {notFound && <p className="error-text" style={{ marginTop: "1rem" }}>No matching flights found for that carrier.</p>}
          {error && <p className="error-text" style={{ marginTop: "1rem" }}>Could not reach the API.</p>}
        </div>
      </section>

      {tab === "levers" && leverResult && (
        <>
          <section className="section">
            <div className="screen">
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "2.4rem", fontWeight: 700, color: scoreColor(leverResult.current_score) }}>
                  {Math.round(leverResult.current_score)}
                </span>
                <div>
                  <div style={{ color: scoreColor(leverResult.current_score), fontWeight: 600 }}>{leverResult.current_rating}</div>
                  <div className="tile-label">{carrierName(leverResult.carrier)}&apos;s current Health Score, vs. {leverResult.peer_count} peer carriers</div>
                </div>
              </div>

              {topLever && parseFloat(topLever.point_gain.toFixed(1)) > 0 && (
                <div className="decision-verdict">
                  <span className="decision-verdict-label">Recommendation</span>
                  Biggest lever: <strong>{COMPONENT_LABELS[topLever.component]}</strong>. If this
                  one component matched the network median ({topLever.network_median.toFixed(1)}{" "}
                  vs. its current {topLever.current_value.toFixed(1)}), the overall score would be{" "}
                  <strong>{topLever.hypothetical_score_if_at_median.toFixed(1)}</strong> instead
                  of {leverResult.current_score.toFixed(1)} &mdash; a gain of{" "}
                  <strong>{topLever.point_gain.toFixed(1)} points</strong>, holding every other
                  component exactly as it is now. This is the single highest-leverage place to
                  look first, given the scoring formula &mdash; not a claim it's the easiest to
                  actually fix.
                </div>
              )}
              {topLever && parseFloat(topLever.point_gain.toFixed(1)) <= 0 && (
                <div className="decision-verdict">
                  <span className="decision-verdict-label">Recommendation</span>
                  No single-component lever here. Every component is already at or above the
                  network median &mdash; this carrier isn&apos;t behind its peers on any one
                  dimension, so there&apos;s nothing this specific method can point to as an
                  opportunity.
                </div>
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">All five components, ranked by point gain</h2>
            </div>
            <div className="screen">
              <div className="rotation-table-wrap">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Current</th>
                      <th>Network median</th>
                      <th>Weight in score</th>
                      <th>Current points earned</th>
                      <th>Hypothetical score</th>
                      <th>Point gain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leverResult.levers.map((l) => {
                      const rounded = parseFloat(l.point_gain.toFixed(1)) === 0 ? "0.0" : l.point_gain.toFixed(1);
                      const isPositive = parseFloat(rounded) > 0;
                      return (
                        <tr key={l.component}>
                          <td>{COMPONENT_LABELS[l.component] ?? l.component}</td>
                          <td>{l.current_value.toFixed(1)}</td>
                          <td>{l.network_median.toFixed(1)}</td>
                          <td>{(l.weight * 100).toFixed(1)}%</td>
                          <td>{(l.current_value * l.weight).toFixed(1)}/{(100 * l.weight).toFixed(1)} pts</td>
                          <td>{l.hypothetical_score_if_at_median.toFixed(1)}</td>
                          <td className={isPositive ? "tile-value" : ""}>
                            {isPositive ? "+" : ""}{rounded}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {tab === "scenario" && scenarioResult && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              Average knock-on departure delay for {carrierName(scenarioResult.carrier ?? "")}
            </h2>
            <span className="section-note">minutes, by turnaround tightness x inbound delay</span>
          </div>
          <div className="screen">
            {(() => {
              const verdict = deriveScenarioVerdict(scenarioResult);
              return verdict ? (
                <div className="decision-verdict">
                  <span className="decision-verdict-label">Pattern in the data</span>
                  {verdict}
                </div>
              ) : null;
            })()}

            <div className="rotation-table-wrap" style={{ marginTop: "1.25rem" }}>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Scheduled turnaround</th>
                    {PREDECESSOR_COLS.map((col) => <th key={col}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {TURNAROUND_ROWS.map((row) => (
                    <tr key={row}>
                      <td>
                        {row === "Tight" && `Tight (\u2264${scenarioResult.tight_turnaround_minutes} min)`}
                        {row === "Normal" && `Normal (${scenarioResult.tight_turnaround_minutes + 1}\u2013${scenarioResult.target_turnaround_minutes} min)`}
                        {row === "Loose" && `Loose (>${scenarioResult.target_turnaround_minutes} min)`}
                      </td>
                      {PREDECESSOR_COLS.map((col) => {
                        const cell = scenarioCell(row, col);
                        return (
                          <td key={col}>
                            {cell ? (
                              <>
                                <span style={{ color: delayColor(cell.avg_successor_dep_delay), fontWeight: 600 }}>
                                  {cell.avg_successor_dep_delay.toFixed(1)} min
                                </span>
                                <span className="tile-label" style={{ display: "block" }}>
                                  {cell.pairs.toLocaleString()} pairs
                                </span>
                              </>
                            ) : (
                              <span className="tile-label">no data</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="page-note" style={{ marginTop: "1rem" }}>
              Reading this: compare across a row to see how much an inbound delay actually costs
              the next flight under that turnaround type. Compare down a column to see whether
              tighter turnarounds actually run worse, given how they were used in practice &mdash;
              not assuming they would if used differently.
            </p>
          </div>
        </section>
      )}

      {tab === "ranking" && rankingResult && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Every carrier&apos;s biggest single lever, ranked</h2>
            <span className="section-note">{rankingResult.peer_count} carriers</span>
          </div>
          <div className="screen">
            {(() => {
              const verdict = deriveRankingVerdict(rankingResult);
              return verdict ? (
                <div className="decision-verdict">
                  <span className="decision-verdict-label">Reading the ranking</span>
                  {verdict}
                </div>
              ) : null;
            })()}

            {(() => {
              const positiveGainCarriers = rankingResult.carriers.filter(
                (e) => parseFloat(e.top_lever_point_gain.toFixed(1)) > 0
              );
              const budgetOptions: (number | null)[] = [1, 3, 5, null];
              const effectiveBudget = portfolioBudget ?? positiveGainCarriers.length;
              const selected = positiveGainCarriers.slice(0, effectiveBudget);
              const selectedCarrierCodes = new Set(selected.map((e) => e.carrier));
              const totalNetworkFlights = rankingResult.carriers.reduce((sum, e) => sum + e.total_flights, 0);
              const selectedFlights = selected.reduce((sum, e) => sum + e.total_flights, 0);
              const coveragePct = totalNetworkFlights ? (selectedFlights / totalNetworkFlights) * 100 : 0;

              return (
                <>
                  <div style={{ marginTop: "1.5rem" }}>
                    <span className="filter-label" style={{ display: "block", marginBottom: "0.5rem" }}>
                      If you could only focus on a few carriers this cycle, how many?
                    </span>
                    <span className="sort-toggle">
                      {budgetOptions.map((b) => (
                        <button
                          key={b ?? "all"}
                          type="button"
                          className={portfolioBudget === b ? "sort-toggle-active" : ""}
                          onClick={() => setPortfolioBudget(b)}
                        >
                          {b ?? `All ${positiveGainCarriers.length} with a real gap`}
                        </button>
                      ))}
                    </span>
                  </div>

                  {selected.length > 0 ? (
                    <div className="decision-verdict" style={{ marginTop: "1rem" }}>
                      <span className="decision-verdict-label">Portfolio coverage</span>
                      Your top {selected.length} pick{selected.length === 1 ? "" : "s"} by point gain
                      ({selected.map((e) => carrierName(e.carrier)).join(", ")}) collectively touch{" "}
                      <strong>{selectedFlights.toLocaleString()} flights</strong> in this data &mdash;{" "}
                      <strong>{coveragePct.toFixed(1)}%</strong> of the network&apos;s{" "}
                      {totalNetworkFlights.toLocaleString()} total. This is real flight-count coverage,
                      not a combined "priority score" &mdash; point gains from different carriers aren&apos;t
                      on a shared scale, so they aren&apos;t added together here.
                    </div>
                  ) : (
                    <p className="page-note" style={{ marginTop: "1rem" }}>
                      No carrier here has a positive single-component gap against the network median
                      &mdash; there&apos;s nothing this method would recommend focusing on right now.
                    </p>
                  )}

                  <div className="opportunity-leaderboard" style={{ marginTop: "1.25rem" }}>
                    {rankingResult.carriers.map((entry, i) => (
                      <div
                        key={entry.carrier}
                        className={`opportunity-row${selectedCarrierCodes.has(entry.carrier) ? " opportunity-row-selected" : ""}`}
                      >
                        <span className="opportunity-rank">{i + 1}</span>
                        <div className="opportunity-main">
                          <div className="opportunity-carrier">
                            {carrierName(entry.carrier)}
                            <span className="tile-label" style={{ marginLeft: "0.6rem" }}>
                              {entry.current_rating} &middot; score {entry.current_score.toFixed(1)}
                            </span>
                          </div>
                          <div className="page-note" style={{ marginTop: "0.25rem" }}>
                            Biggest lever: <strong>{COMPONENT_LABELS[entry.top_lever_component] ?? entry.top_lever_component}</strong>{" "}
                            ({entry.top_lever_current_value.toFixed(1)} vs. network median {entry.top_lever_network_median.toFixed(1)})
                            &mdash; {entry.total_flights.toLocaleString()} flights in this data.
                          </div>
                        </div>
                        {(() => {
                          const rounded = parseFloat(entry.top_lever_point_gain.toFixed(1)) === 0 ? "0.0" : entry.top_lever_point_gain.toFixed(1);
                          const isPositive = parseFloat(rounded) > 0;
                          return (
                            <div className="opportunity-gain" style={{ color: isPositive ? "#4f9d8f" : "#9099a8" }}>
                              {isPositive ? "+" : ""}{rounded}
                              <span className="tile-label" style={{ display: "block", textAlign: "right" }}>pt gain</span>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </section>
      )}

      {tab === "risk" && riskResult && (
        <>
          <section className="section">
            <div className="screen">
              {(() => {
                const bandColor: Record<string, string> = {
                  high: "#c9563a", elevated: "#e8a33d", watch: "#e8a33d", low: "#4f9d8f",
                };
                const color = bandColor[riskResult.risk_band] ?? "#9099a8";
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                    <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "2.4rem", fontWeight: 700, color }}>
                      {(riskResult.risk_probability * 100).toFixed(0)}%
                    </span>
                    <div>
                      <div style={{ color, fontWeight: 600, textTransform: "capitalize" }}>{riskResult.risk_band} risk</div>
                      <div className="tile-label">
                        {riskEntityType === "carrier" ? carrierName(riskResult.entity) : riskResult.entity}
                        , as of {riskResult.as_of_period}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <p className="page-note" style={{ marginTop: "1rem" }}>{riskResult.risk_threshold_definition}</p>

              <div className="decision-verdict" style={{ marginTop: "1rem" }}>
                <span className="decision-verdict-label">What&apos;s driving this</span>
                {[...riskResult.model_coefficients]
                  .sort((a, b) => Math.abs(b.standardized_coefficient) - Math.abs(a.standardized_coefficient))
                  .slice(0, 3)
                  .map((c, i) => (
                    <span key={c.feature}>
                      {i > 0 && "; "}
                      <strong>{FEATURE_LABELS[c.feature] ?? c.feature}</strong> ({riskResult.current_features[c.feature]?.toFixed(c.feature === "average_departure_delay" ? 1 : 3)})
                      {" "}pushes risk {c.direction === "higher_risk" ? "up" : "down"}
                    </span>
                  ))}
                {" "}&mdash; the three features this model weighted most heavily, in order.
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Model quality &mdash; check this before trusting the number above</h2>
            </div>
            <div className="screen">
              <div className="board board-compact">
                <Tile label="Trained on" value={`${riskResult.entities_in_training_panel} entities`} />
                <Tile label="Train / val / test examples" value={`${riskResult.split.train_examples} / ${riskResult.split.validation_examples} / ${riskResult.split.test_examples}`} />
                <Tile label="Test-set PR-AUC" value={riskResult.test_metrics.precision_recall_auc.toFixed(3)} tone={riskResult.test_metrics.precision_recall_auc < 0.55 ? "rust" : undefined} />
                <Tile label="Test-set positive rate" value={`${(riskResult.test_metrics.positive_rate * 100).toFixed(1)}%`} />
              </div>
              <p className="page-note" style={{ marginTop: "0.75rem" }}>
                PR-AUC compares against the positive rate as a random baseline (
                {riskResult.test_metrics.positive_rate.toFixed(3)} here) &mdash; the closer this
                model&apos;s PR-AUC is to that baseline, the less real signal it found. Trained on
                the date range {riskResult.split.train_end} and earlier; validated through{" "}
                {riskResult.split.validation_end}; tested only on periods after that &mdash; the
                test set never touched training or calibration.
              </p>

              {riskResult.test_metrics.calibration_bins.length > 0 && (
                <div style={{ marginTop: "1.25rem" }}>
                  <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>
                    Calibration: predicted vs. actually-observed risk (test set)
                  </p>
                  <table className="compare-table">
                    <thead>
                      <tr><th>Predicted band</th><th>Count</th><th>Mean predicted</th><th>Actually observed</th></tr>
                    </thead>
                    <tbody>
                      {riskResult.test_metrics.calibration_bins.map((b) => (
                        <tr key={b.probability_band}>
                          <td>{b.probability_band}</td>
                          <td>{b.count}</td>
                          <td>{(b.mean_predicted_probability * 100).toFixed(1)}%</td>
                          <td>{(b.observed_risk_rate * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="page-note" style={{ marginTop: "0.5rem" }}>
                    If &quot;mean predicted&quot; and &quot;actually observed&quot; are close in every
                    row, the model&apos;s stated confidence is trustworthy. If they diverge, the
                    risk_band label above is a rougher signal than it looks.
                  </p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {tab === "bank" && bankResult && (
        <section className="section">
          <div className="screen">
            <div className="board board-compact">
              <Tile label="Original peak load" value={`${bankResult.original_peak_load} flights`} tone={bankResult.original_peak_load > bankResult.optimized_peak_load ? "rust" : undefined} />
              <Tile label="Optimized peak load" value={`${bankResult.optimized_peak_load} flights`} />
              <Tile label="Flights moved" value={`${bankResult.flights_moved} of ${bankResult.flights_considered}`} />
              <Tile label="Avg movement" value={`${bankResult.average_movement_minutes} min`} />
            </div>

            <p className="page-note" style={{ marginTop: "0.75rem" }}>
              Window {bankResult.window} at {bankResult.airport}{bankResult.carrier ? ` (${bankResult.carrier} only)` : " (all carriers)"}
              , {bankResult.date_range}, {bankResult.mode === "risk_averse" ? "risk-averse (CVaR)" : "expected-value"} mode.
              Preferred bank limit: {bankResult.preferred_bank_limit} flights/15-min
              {bankResult.preferred_bank_limit_was_auto_computed
                ? (bankResult.seasonal_baseline.used
                    ? " (auto-computed from the seasonal baseline below)"
                    : " (auto-computed from this window's own average load -- no seasonal baseline available)")
                : " (set by you)"}.
              {bankResult.flight_limit_applied && " Note: the flight count hit the safety cap for this window -- results reflect a truncated sample."}
            </p>

            <div className="decision-verdict" style={{ marginTop: "1rem" }}>
              <span className="decision-verdict-label">Seasonal baseline</span>
              <span>
                {" "}{bankResult.seasonal_baseline.note}
                {bankResult.seasonal_baseline.used && (
                  <>
                    {" "}This window is averaging {bankResult.seasonal_baseline.current_window_average_load} flights/bucket
                    vs. a seasonal norm of {bankResult.seasonal_baseline.seasonal_average_load}
                    {bankResult.seasonal_baseline.current_vs_seasonal_pct != null && (
                      <> ({bankResult.seasonal_baseline.current_vs_seasonal_pct > 0 ? "+" : ""}{bankResult.seasonal_baseline.current_vs_seasonal_pct}% vs. normal for this time of year)</>
                    )}.
                  </>
                )}
              </span>
            </div>

            <div className="decision-verdict" style={{ marginTop: "1rem" }}>
              <span className="decision-verdict-label">Objective decomposition</span>
              <span> Congestion exposure: {bankResult.objective_decomposition.congestion_exposure} &middot; Schedule-shift penalty: {bankResult.objective_decomposition.schedule_shift_penalty}</span>
            </div>

            <div style={{ marginTop: "1.5rem" }}>
              <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Bank load, before vs. after</p>
              <table className="compare-table">
                <thead>
                  <tr><th>Time</th><th>Original</th><th>Optimized</th></tr>
                </thead>
                <tbody>
                  {Array.from(new Set([...Object.keys(bankResult.original_bank_load), ...Object.keys(bankResult.optimized_bank_load)]))
                    .sort()
                    .map((t) => (
                      <tr key={t}>
                        <td>{t}</td>
                        <td>{bankResult.original_bank_load[t] ?? 0}</td>
                        <td>{bankResult.optimized_bank_load[t] ?? 0}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <p className="page-note" style={{ marginTop: "1rem" }}>
              {bankResult.methodology.cvar_note ?? bankResult.methodology.congestion_source}
            </p>
          </div>
        </section>
      )}

      {tab === "portfolio" && portfolioResult && (
        <section className="section">
          <div className="screen">
            <div className="board board-compact">
              <Tile label="Resource consumed" value={`${portfolioResult.resource_consumed} / ${portfolioResult.budget}`} />
              <Tile label="Selected" value={String(portfolioResult.selected.length)} />
              <Tile label="Rejected" value={String(portfolioResult.rejected.length)} />
              <Tile label="Optimized for" value={portfolioResult.primary_metric} />
            </div>
            {portfolioResult.primary_metric_note && (
              <p className="page-note" style={{ marginTop: "0.75rem" }}>{portfolioResult.primary_metric_note}</p>
            )}

            <div style={{ marginTop: "1.5rem" }}>
              <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Selected portfolio</p>
              {portfolioResult.selected.map((s: any) => (
                <div key={s.candidate_id} className="decision-verdict" style={{ marginBottom: "0.6rem" }}>
                  <span className="decision-verdict-label">
                    {s.candidate_type === "carrier" ? carrierName(s.candidate_id) : s.candidate_id} &mdash; marginal gain {s.marginal_gain}
                  </span>
                  <span>{s.reason}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "1.5rem" }}>
              <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Total coverage of the selected portfolio (every metric, not just the one optimized)</p>
              <table className="compare-table">
                <thead><tr><th>Metric</th><th>Selected total</th><th>Residual (not selected)</th></tr></thead>
                <tbody>
                  {Object.keys(portfolioResult.total_coverage).map((k) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{portfolioResult.total_coverage[k]}</td>
                      <td>{portfolioResult.residual_exposure[k] ?? "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {portfolioResult.rejected.length > 0 && (
              <div style={{ marginTop: "1.5rem" }}>
                <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Rejected alternatives</p>
                <table className="compare-table">
                  <thead><tr><th>Candidate</th><th>Reason</th></tr></thead>
                  <tbody>
                    {portfolioResult.rejected.map((r: any) => (
                      <tr key={r.candidate_id}>
                        <td>{r.candidate_type === "carrier" ? carrierName(r.candidate_id) : r.candidate_id}</td>
                        <td>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="page-note" style={{ marginTop: "1rem" }}>{portfolioResult.methodology.combination_policy}</p>
          </div>
        </section>
      )}

      {tab === "resilience" && resilienceResult && (
        <section className="section">
          <div className="screen">
            <div className="board board-compact">
              <Tile label="Airports in graph" value={String(resilienceResult.scope.airport_count)} />
              <Tile label="Routes in graph" value={String(resilienceResult.scope.route_count)} />
              <Tile label="Min flights/route" value={String(resilienceResult.scope.minimum_flights_per_route)} />
            </div>

            <div style={{ marginTop: "1.5rem" }}>
              <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>
                Top structural bridges (betweenness centrality)
              </p>
              <table className="compare-table">
                <thead><tr><th>Airport</th><th>Betweenness</th></tr></thead>
                <tbody>
                  {resilienceResult.betweenness_centrality.top_structural_bridges.map((e) => (
                    <tr key={e.airport}><td>{e.airport}</td><td>{e.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: "1.5rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 300px" }}>
                <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Top by route count</p>
                <table className="compare-table">
                  <thead><tr><th>Airport</th><th>Routes</th></tr></thead>
                  <tbody>
                    {resilienceResult.degree_centrality.top_by_route_count.map((e) => (
                      <tr key={e.airport}><td>{e.airport}</td><td>{e.value}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ flex: "1 1 300px" }}>
                <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Top by flight volume</p>
                <table className="compare-table">
                  <thead><tr><th>Airport</th><th>Flights</th></tr></thead>
                  <tbody>
                    {resilienceResult.degree_centrality.top_by_flight_volume.map((e) => (
                      <tr key={e.airport}><td>{e.airport}</td><td>{e.value.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="page-note" style={{ marginTop: "1rem" }}>{resilienceResult.methodology.combination_policy}</p>
          </div>
        </section>
      )}
    </main>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "rust" }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className={`tile-value ${tone === "rust" ? "rust" : ""}`}>{value}</span>
    </div>
  );
}
