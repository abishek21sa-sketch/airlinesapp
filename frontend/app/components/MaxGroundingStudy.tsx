"use client";

import { carrierName } from "../lib/carriers";

type GroupStats = {
  total_flights: number;
  distinct_tails: number;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
  cancellation_rate: number;
};

type VariantStat = { variant: string; total_flights: number; on_time_rate: number };

type ByCarrier = { carrier: string; tail_count: number; max: GroupStats; control: GroupStats };

type MaxGroundingData = {
  carriers: string[];
  grounding_date: string;
  ungrounding_date: string;
  resumption_window_start: string;
  by_carrier: ByCarrier[];
  max_post_resumption: GroupStats;
  control_post_resumption: GroupStats;
  max_pre_grounding_reference_only: GroupStats;
  by_variant_post_resumption: VariantStat[];
};

function StatRow({ label, max, control, tone }: { label: string; max: string; control: string; tone?: "rust" }) {
  return (
    <tr>
      <td>{label}</td>
      <td className={tone === "rust" ? "tile-value rust" : "tile-value"}>{max}</td>
      <td className={tone === "rust" ? "tile-value rust" : "tile-value"}>{control}</td>
    </tr>
  );
}

export default function MaxGroundingStudy({ data }: { data: MaxGroundingData }) {
  const m = data.max_post_resumption;
  const c = data.control_post_resumption;
  const pre = data.max_pre_grounding_reference_only;

  return (
    <div>
      <table className="compare-table" style={{ marginBottom: "1.5rem" }}>
        <thead>
          <tr>
            <th>Since {data.resumption_window_start}</th>
            <th>The 72 grounded MAX tails</th>
            <th>Same carriers, other flights</th>
          </tr>
        </thead>
        <tbody>
          <StatRow label="Total flights" max={m.total_flights.toLocaleString()} control={c.total_flights.toLocaleString()} />
          <StatRow label="Distinct tails" max={m.distinct_tails.toLocaleString()} control={c.distinct_tails.toLocaleString()} />
          <StatRow label="On-time rate" max={`${(m.on_time_rate * 100).toFixed(1)}%`} control={`${(c.on_time_rate * 100).toFixed(1)}%`} />
          <StatRow
            label="Avg arrival delay"
            max={`${m.avg_arrival_delay_minutes.toFixed(1)} min`}
            control={`${c.avg_arrival_delay_minutes.toFixed(1)} min`}
            tone="rust"
          />
          <StatRow
            label="Cancellation rate"
            max={`${(m.cancellation_rate * 100).toFixed(2)}%`}
            control={`${(c.cancellation_rate * 100).toFixed(2)}%`}
            tone="rust"
          />
        </tbody>
      </table>

      {data.by_carrier.length > 1 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>
            By carrier, since {data.resumption_window_start} &mdash; pooled numbers above can mask
            per-carrier differences
          </p>
          <div className="rotation-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Carrier</th>
                  <th>MAX tails</th>
                  <th>MAX on-time</th>
                  <th>Control on-time</th>
                  <th>MAX avg delay</th>
                  <th>Control avg delay</th>
                  <th>MAX cancel.</th>
                  <th>Control cancel.</th>
                </tr>
              </thead>
              <tbody>
                {data.by_carrier.map((row) => (
                  <tr key={row.carrier}>
                    <td>{carrierName(row.carrier)}</td>
                    <td>{row.tail_count}</td>
                    <td>{(row.max.on_time_rate * 100).toFixed(1)}%</td>
                    <td>{(row.control.on_time_rate * 100).toFixed(1)}%</td>
                    <td className="tile-value rust">{row.max.avg_arrival_delay_minutes.toFixed(1)} min</td>
                    <td className="tile-value rust">{row.control.avg_arrival_delay_minutes.toFixed(1)} min</td>
                    <td className="tile-value rust">{(row.max.cancellation_rate * 100).toFixed(2)}%</td>
                    <td className="tile-value rust">{(row.control.cancellation_rate * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.by_variant_post_resumption.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>By variant, since {data.resumption_window_start}</p>
          <table className="compare-table">
            <thead>
              <tr>
                <th>Variant</th>
                <th>Flights</th>
                <th>On-time rate</th>
              </tr>
            </thead>
            <tbody>
              {data.by_variant_post_resumption.map((v) => (
                <tr key={v.variant}>
                  <td>{v.variant}</td>
                  <td>{v.total_flights.toLocaleString()}</td>
                  <td>{(v.on_time_rate * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="page-note">
        Reference only, not a clean comparison (see note above on the COVID-era confound): the
        same 72 tails before the {data.grounding_date} grounding averaged{" "}
        <strong>{(pre.on_time_rate * 100).toFixed(1)}% on-time</strong>,{" "}
        {pre.avg_arrival_delay_minutes.toFixed(1)} min average arrival delay,{" "}
        {(pre.cancellation_rate * 100).toFixed(2)}% cancellation rate, across{" "}
        {pre.total_flights.toLocaleString()} flights.
      </p>
    </div>
  );
}
