"use client";

import { useState } from "react";
import FilteredOverview from "./FilteredOverview";
import CarrierChart from "./CarrierChart";
import DelayCauseChart from "./DelayCauseChart";
import AirportChart from "./AirportChart";
import RouteChart from "./RouteChart";

type Summary = {
  total_flights: number;
  start_date: string;
  end_date: string;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
  cancellation_rate: number;
};
type MonthPoint = { month: string; total_flights: number; on_time_rate: number };
type Carrier = {
  carrier: string;
  total_flights: number;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
  cancellation_rate: number;
};
type Cause = { cause: string; minutes: number; share: number };
type Airport = { airport: string; total_flights: number };
type Route = { route: string; total_flights: number; on_time_rate: number };

type TabId = "overview" | "carriers" | "delays" | "airports" | "routes";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "carriers", label: "Carriers" },
  { id: "delays", label: "Delays" },
  { id: "airports", label: "Airports" },
  { id: "routes", label: "Routes" },
];

export default function TabbedSections({
  summary,
  trend,
  carriers,
  causes,
  airports,
  routes,
}: {
  summary: Summary | null;
  trend: { months: MonthPoint[] } | null;
  carriers: { carriers: Carrier[] } | null;
  causes: { causes: Cause[] } | null;
  airports: { airports: Airport[] } | null;
  routes: { routes: Route[] } | null;
}) {
  const [active, setActive] = useState<TabId>("overview");

  return (
    <div>
      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${active === tab.id ? "tab-active" : ""}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "overview" && (
        <Section title="On-time rate over time" note="Filter by carrier and date range">
          <FilteredOverview initialSummary={summary} initialTrend={trend} />
        </Section>
      )}

      {active === "carriers" && (
        <Section title="On-time rate by carrier" note="All 11 carriers · ranked">
          {carriers ? <CarrierChart data={carriers.carriers} /> : <Missing />}
        </Section>
      )}

      {active === "delays" && (
        <Section
          title="Delay causes"
          note="BTS's own recorded categories — largest category, not root cause"
        >
          {causes ? <DelayCauseChart data={causes.causes} /> : <Missing />}
        </Section>
      )}

      {active === "airports" && (
        <Section title="Busiest airports" note="Top 15 by total flight volume, departures + arrivals">
          {airports ? <AirportChart data={airports.airports} /> : <Missing />}
        </Section>
      )}

      {active === "routes" && (
        <Section title="Busiest routes" note="Top 15 directional routes, bar color = on-time rate">
          {routes ? <RouteChart data={routes.routes} /> : <Missing />}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <span className="section-note">{note}</span>
      </div>
      <div className="screen">{children}</div>
    </section>
  );
}

function Missing() {
  return <p className="error-text">Could not load this section.</p>;
}
