"use client";

type RouteExposure = {
  carrier: string;
  origin: string;
  dest: string;
  pre_route_flights: number;
  pre_max_flights: number;
  pre_max_share_pct: number;
  exposure_tier: "high" | "moderate" | "low" | "incidental";
  post_2019_flights_per_day: number;
  post_2019_change_pct: number | null;
  early_2020_change_pct: number | null;
  relative_change_vs_carrier_pct_points: number | null;
  post_2019_status: string;
};

function tierColor(tier: string): string {
  if (tier === "high") return "#c9563a";
  if (tier === "moderate") return "#e8a33d";
  if (tier === "low") return "#4f9d8f";
  return "#9099a8";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    dropped: "Dropped",
    sharply_reduced: "Sharply reduced",
    reduced: "Reduced",
    broadly_maintained: "Maintained",
    increased: "Increased",
    unknown: "Unknown",
  };
  return labels[status] ?? status;
}

function pct(v: number | null): string {
  if (v == null) return "\u2014";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default function RouteExposureTable({ routes, limit = 30 }: { routes: RouteExposure[]; limit?: number }) {
  const shown = routes.slice(0, limit);

  return (
    <div>
      <div className="rotation-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Carrier</th>
              <th>Route</th>
              <th>Pre-grounding MAX flights</th>
              <th>MAX share of route</th>
              <th>Exposure</th>
              <th>Post-2019 change</th>
              <th>Jan&ndash;Feb 2020 change</th>
              <th>vs. carrier benchmark</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.carrier}-${r.origin}-${r.dest}-${i}`}>
                <td>{r.carrier}</td>
                <td>{r.origin} &rarr; {r.dest}</td>
                <td>{r.pre_max_flights.toLocaleString()} / {r.pre_route_flights.toLocaleString()}</td>
                <td>{r.pre_max_share_pct.toFixed(1)}%</td>
                <td style={{ color: tierColor(r.exposure_tier) }}>{r.exposure_tier}</td>
                <td>{pct(r.post_2019_change_pct)}</td>
                <td>{pct(r.early_2020_change_pct)}</td>
                <td>{r.relative_change_vs_carrier_pct_points != null ? `${r.relative_change_vs_carrier_pct_points > 0 ? "+" : ""}${r.relative_change_vs_carrier_pct_points.toFixed(1)}pp` : "\u2014"}</td>
                <td>{statusLabel(r.post_2019_status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {routes.length > limit && (
        <p className="page-note" style={{ marginTop: "0.5rem" }}>
          Showing the top {limit} of {routes.length} MAX-exposed routes by pre-grounding flight
          volume &mdash; sorted highest exposure first.
        </p>
      )}
    </div>
  );
}
