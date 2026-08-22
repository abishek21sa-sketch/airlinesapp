"use client";

import { carrierName } from "../lib/carriers";

type CarrierImpact = {
  carrier: string;
  exposed_route_count: number;
  high_exposure_routes: number;
  moderate_exposure_routes: number;
  pre_grounding_max_flights: number;
  max_share_of_carrier_schedule_pct: number | null;
  routes_dropped: number;
  routes_sharply_reduced: number;
  routes_reduced: number;
  routes_maintained_or_increased: number;
  carrier_post_2019_schedule_change_pct: number | null;
  carrier_early_2020_schedule_change_pct: number | null;
};

function pct(v: number | null): string {
  if (v == null) return "\u2014";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default function CarrierImpactSummary({ data }: { data: CarrierImpact[] }) {
  return (
    <div className="rotation-table-wrap">
      <table className="compare-table">
        <thead>
          <tr>
            <th>Carrier</th>
            <th>MAX share of schedule</th>
            <th>Exposed routes</th>
            <th>High/moderate exposure</th>
            <th>Dropped</th>
            <th>Sharply reduced</th>
            <th>Reduced</th>
            <th>Maintained/increased</th>
            <th>Carrier&apos;s own change, post-2019</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.carrier}>
              <td>{carrierName(c.carrier)}</td>
              <td>{c.max_share_of_carrier_schedule_pct != null ? `${c.max_share_of_carrier_schedule_pct.toFixed(1)}%` : "\u2014"}</td>
              <td>{c.exposed_route_count}</td>
              <td>{c.high_exposure_routes + c.moderate_exposure_routes}</td>
              <td className="tile-value rust">{c.routes_dropped}</td>
              <td className="tile-value rust">{c.routes_sharply_reduced}</td>
              <td>{c.routes_reduced}</td>
              <td>{c.routes_maintained_or_increased}</td>
              <td>{pct(c.carrier_post_2019_schedule_change_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
