"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import CarrierChart from "../components/CarrierChart";
import DateRangePreset from "../components/DateRangePreset";
import { CARRIER_NAMES, carrierName } from "../lib/carriers";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type Carrier = {
  carrier: string;
  total_flights: number;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
  cancellation_rate: number;
};

type Summary = {
  total_flights: number;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
  cancellation_rate: number;
};

const CARRIER_CODES = Object.keys(CARRIER_NAMES);

function buildQuery(params: Record<string, string>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) usp.set(k, v);
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export default function CarriersPage() {
  const [ranking, setRanking] = useState<{ carriers: Carrier[] } | null>(null);

  const [carrierInput, setCarrierInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/carriers`)
      .then((r) => r.json())
      .then(setRanking)
      .catch(() => setRanking(null));
  }, []);

  async function lookupCarrier() {
    if (!carrierInput) return;
    setLoading(true);
    setNotFound(false);
    const qs = buildQuery({ carrier: carrierInput, start_date: startDate, end_date: endDate });
    try {
      const res = await fetch(`${API_BASE}/api/summary${qs}`);
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
        <p className="eyebrow">DOT On-Time Performance &middot; Carriers</p>
        <h1 className="title">Carriers</h1>
        <p className="subtitle">Overall ranking, or a quick stats check before visiting a full profile.</p>
      </header>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">On-time rate by carrier</h2>
          <span className="section-note">All 11 carriers, ranked, full history</span>
        </div>
        <div className="screen">
          {ranking ? <CarrierChart data={ranking.carriers} /> : <p className="error-text">Loading...</p>}
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
              <span className="filter-label">Carrier</span>
              <select value={carrierInput} onChange={(e) => setCarrierInput(e.target.value)}>
                <option value="">Select carrier</option>
                {CARRIER_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} &mdash; {carrierName(code)}
                  </option>
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
              onClick={lookupCarrier}
              disabled={!carrierInput || loading}
            >
              {loading ? "Looking up..." : "Look up"}
            </button>
          </div>

          {notFound && !loading && (
            <p className="error-text" style={{ marginTop: "1rem" }}>No flights found for that carrier/date range.</p>
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
                      href={`/carriers/${carrierInput}${qs ? `?${qs}` : ""}`}
                      className="profile-action-button"
                    >
                      View {carrierInput}&apos;s full profile &rarr;
                    </Link>
                  );
                })()}
              </p>
              <p className="page-note" style={{ marginTop: "0.5rem" }}>
                Health score, trend, delay causes, schedule padding, codeshare split, top routes.
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
