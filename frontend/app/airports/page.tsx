"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AirportChart from "../components/AirportChart";
import DateRangePreset from "../components/DateRangePreset";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type Airport = { airport: string; total_flights: number };

type Summary = {
  total_flights: number;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
  cancellation_rate: number;
};

function buildQuery(params: Record<string, string>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) usp.set(k, v);
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export default function AirportsPage() {
  const [ranking, setRanking] = useState<{ airports: Airport[] } | null>(null);
  const [allAirports, setAllAirports] = useState<string[]>([]);

  const [airportInput, setAirportInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/airports`)
      .then((r) => r.json())
      .then(setRanking)
      .catch(() => setRanking(null));

    fetch(`${API_BASE}/api/airports/list`)
      .then((r) => r.json())
      .then((data) => setAllAirports(data.airports ?? []))
      .catch(() => setAllAirports([]));
  }, []);

  async function lookupAirport() {
    if (!airportInput) return;
    setLoading(true);
    setNotFound(false);
    // /api/summary only ever accepted carrier -- it silently ignored an
    // airport param (FastAPI drops undeclared query params rather than
    // erroring), so this was returning unfiltered, network-wide numbers
    // for every airport lookup. /api/airport-detail is the real,
    // airport-scoped endpoint -- confirmed to return the same field
    // shape (total_flights, on_time_rate, avg_arrival_delay_minutes,
    // cancellation_rate) this page already expects, so no other change
    // was needed once pointed at the right place.
    const qs = buildQuery({ airport: airportInput, start_date: startDate, end_date: endDate });
    try {
      const res = await fetch(`${API_BASE}/api/airport-detail${qs}`);
      if (res.status === 404) {
        setNotFound(true);
        setSummary(null);
        return;
      }
      setSummary(await res.json());
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">DOT On-Time Performance &middot; Airports</p>
        <h1 className="title">Airports</h1>
        <p className="subtitle">Overall ranking, or a quick stats check before visiting a full profile.</p>
      </header>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Busiest airports</h2>
          <span className="section-note">Top 15 by total flight volume, departures + arrivals</span>
        </div>
        <div className="screen">
          {ranking ? <AirportChart data={ranking.airports} /> : <p className="error-text">Loading...</p>}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Quick lookup</h2>
          <span className="section-note">Stats only &mdash; the full profile has everything else</span>
        </div>
        <div className="screen">
          <div className="route-lookup-row">
            <label className="filter-field">
              <span className="filter-label">Airport</span>
              <select value={airportInput} onChange={(e) => setAirportInput(e.target.value)}>
                <option value="">Select airport</option>
                {allAirports.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
            <DateRangePreset
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => { setStartDate(start); setEndDate(end); }}
            />
            <button
              type="button"
              className="compare-run"
              onClick={lookupAirport}
              disabled={!airportInput || loading}
            >
              {loading ? "Looking up..." : "Look up"}
            </button>
          </div>

          {notFound && !loading && (
            <p className="error-text" style={{ marginTop: "1rem" }}>No flights found for that airport/date range.</p>
          )}

          {summary && !notFound && (
            <div style={{ marginTop: "1.5rem" }}>
              <div className="board board-compact">
                <Tile label="Total flights" value={summary.total_flights.toLocaleString()} />
                <Tile label="On-time rate" value={`${(summary.on_time_rate * 100).toFixed(1)}%`} />
                <Tile label="Avg arrival delay" value={`${summary.avg_arrival_delay_minutes.toFixed(1)} min`} tone="rust" />
                <Tile label="Cancellation rate" value={`${(summary.cancellation_rate * 100).toFixed(2)}%`} tone="rust" />
              </div>

              <p className="page-note" style={{ marginTop: "1rem" }}>
                {(() => {
                  const params = new URLSearchParams();
                  if (startDate) params.set("start", startDate);
                  if (endDate) params.set("end", endDate);
                  const qs = params.toString();
                  return (
                    <Link
                      href={`/airports/${airportInput}${qs ? `?${qs}` : ""}`}
                      className="profile-action-button"
                    >
                      View {airportInput}&apos;s full profile &rarr;
                    </Link>
                  );
                })()}
              </p>
              <p className="page-note" style={{ marginTop: "0.5rem" }}>
                Health score, in/outbound split, trend, delay causes, time of day, turnbacks, top routes.
                {(startDate || endDate) && " Carries this exact date range over automatically."}
              </p>
            </div>
          )}
        </div>
      </section>
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
