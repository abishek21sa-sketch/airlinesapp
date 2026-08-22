import Link from "next/link";
import FilteredOverview from "./components/FilteredOverview";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type Summary = {
  total_flights: number;
  start_date: string;
  end_date: string;
  carrier_count: number;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
  cancellation_rate: number;
  unique_routes: number;
  unique_airports: number;
};

type MonthPoint = { month: string; total_flights: number; on_time_rate: number };
type Carrier = { carrier: string; total_flights: number; on_time_rate: number };
type Cause = { cause: string; minutes: number; share: number };
type Airport = { airport: string; total_flights: number };
type Route = { route: string; total_flights: number; on_time_rate: number };
type Aircraft = { tail: string; total_flights: number; on_time_rate: number };

async function getJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const [summary, trend, carriers, causes, airports, routes, aircraft] = await Promise.all([
    getJSON<Summary>("/api/summary"),
    getJSON<{ months: MonthPoint[] }>("/api/trend"),
    getJSON<{ carriers: Carrier[] }>("/api/carriers"),
    getJSON<{ causes: Cause[] }>("/api/delay-causes"),
    getJSON<{ airports: Airport[] }>("/api/airports"),
    getJSON<{ routes: Route[] }>("/api/routes"),
    getJSON<{ aircraft: Aircraft[] }>("/api/aircraft"),
  ]);

  if (!summary) {
    return (
      <main className="page">
        <p className="eyebrow">Connection error</p>
        <h1 className="title">Could not reach the API</h1>
        <p className="error-text">Is FastAPI running at NEXT_PUBLIC_API_BASE_URL?</p>
      </main>
    );
  }

  const topCarrier = carriers?.carriers.length
    ? [...carriers.carriers].sort((a, b) => b.on_time_rate - a.on_time_rate)[0]
    : null;
  const topRoute = routes?.routes[0] ?? null;
  const topAirport = airports?.airports[0] ?? null;
  const topCause = causes?.causes.length
    ? [...causes.causes].sort((a, b) => b.share - a.share)[0]
    : null;
  const topAircraft = aircraft?.aircraft.length
    ? [...aircraft.aircraft].sort((a, b) => b.total_flights - a.total_flights)[0]
    : null;

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">DOT On-Time Performance &middot; Full History</p>
        <h1 className="title">Airline On-Time Performance</h1>
        <p className="subtitle">
          {summary.start_date}<span className="sep">&rarr;</span>{summary.end_date}
          <span className="sep">|</span>{summary.carrier_count} carriers
          <span className="sep">|</span>{summary.total_flights.toLocaleString()} flights
        </p>
      </header>

      <div className="board">
        <Tile label="Total flights" value={summary.total_flights.toLocaleString()} />
        <Tile label="On-time rate" value={`${(summary.on_time_rate * 100).toFixed(1)}%`} />
        <Tile
          label="Avg arrival delay"
          value={`${summary.avg_arrival_delay_minutes.toFixed(1)} min`}
          tone="rust"
        />
        <Tile
          label="Cancellation rate"
          value={`${(summary.cancellation_rate * 100).toFixed(2)}%`}
          tone="rust"
        />
      </div>

      <div className="board board-compact board-compact-2">
        <Tile label="Unique routes served" value={summary.unique_routes.toLocaleString()} />
        <Tile label="Airports served" value={summary.unique_airports.toLocaleString()} />
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">On-time rate over time</h2>
          <span className="section-note">Filter by carrier and date range</span>
        </div>
        <FilteredOverview initialSummary={summary} initialTrend={trend} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Explore further</h2>
          <span className="section-note">Deeper analysis, one entity at a time</span>
        </div>
        <div className="explore-grid">
          <ExploreCard
            href="/carriers"
            title="Carriers"
            teaser={topCarrier ? `Best on-time: ${topCarrier.carrier} at ${(topCarrier.on_time_rate * 100).toFixed(1)}%` : undefined}
          />
          <ExploreCard
            href="/routes"
            title="Routes"
            teaser={topRoute ? `Busiest: ${topRoute.route}, ${topRoute.total_flights.toLocaleString()} flights` : undefined}
          />
          <ExploreCard
            href="/airports"
            title="Airports"
            teaser={topAirport ? `Busiest: ${topAirport.airport}, ${topAirport.total_flights.toLocaleString()} flights` : undefined}
          />
          <ExploreCard
            href="/delays"
            title="Delays"
            teaser={topCause ? `Top cause: ${topCause.cause}, ${(topCause.share * 100).toFixed(0)}% of delay-minutes` : undefined}
          />
          <ExploreCard
            href="/aircraft"
            title="Aircraft"
            teaser={topAircraft ? `Busiest tail: ${topAircraft.tail}, ${topAircraft.total_flights.toLocaleString()} flights` : undefined}
          />
        </div>
      </section>

      <Methodology />
    </main>
  );
}

function ExploreCard({ href, title, teaser }: { href: string; title: string; teaser?: string }) {
  return (
    <Link href={href} className="explore-card">
      <span className="explore-card-title">{title}</span>
      {teaser && <span className="explore-card-teaser">{teaser}</span>}
      <span className="explore-card-arrow">&rarr;</span>
    </Link>
  );
}

function Methodology() {
  return (
    <footer className="methodology">
      <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>
        Data & methodology
      </p>
      <p>
        Source: US Department of Transportation, Bureau of Transportation
        Statistics (BTS), Marketing Carrier On-Time Performance dataset.
        Covers all reporting US carriers, January 2018 through the most
        recently published month.
      </p>
      <p>
        &ldquo;On-time&rdquo; follows DOT&apos;s own standard: an arrival delay
        under 15 minutes. Cancelled flights are excluded from delay and
        on-time calculations but included in the cancellation rate. Delay
        causes are BTS&apos;s own coded categories, assigned only to flights
        delayed 15+ minutes &mdash; they identify the largest contributing
        category, not a root cause. See <Link href="/data-health">data health</Link> for
        coverage details and reporting scope.
      </p>
    </footer>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "rust";
}) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className={`tile-value ${tone === "rust" ? "rust" : ""}`}>{value}</span>
    </div>
  );
}
