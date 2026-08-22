"use client";

import { Fragment } from "react";

type RotationLeg = {
  origin: string;
  dest: string;
  carrier: string;
  crs_dep_time: number | null;
  dep_time: number | null;
  dep_delay: number | null;
  taxi_out: number | null;
  wheels_off: number | null;
  wheels_on: number | null;
  taxi_in: number | null;
  crs_arr_time: number | null;
  arr_time: number | null;
  arr_delay: number | null;
  cancelled: boolean;
  diverted: boolean;
  scheduled_ground_minutes: number | null;
  actual_ground_minutes: number | null;
};

function formatHHMM(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "\u2014";
  const hh = Math.floor(v / 100) % 24;
  const mm = v % 100;
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

function formatDelay(d: number | null): string {
  if (d == null || Number.isNaN(d)) return "\u2014";
  if (d <= 0) return "on time";
  return `+${d.toFixed(0)}m`;
}

function formatGroundGap(scheduled: number | null, actual: number | null): string | null {
  if (scheduled == null && actual == null) return null;
  const s = scheduled != null ? `sched ${scheduled.toFixed(0)}m` : "sched \u2014";
  const a = actual != null ? `actual ${actual.toFixed(0)}m` : "actual \u2014";
  return `${s} \u00b7 ${a}`;
}

export default function AircraftRotationTimeline({ legs }: { legs: RotationLeg[] }) {
  return (
    <div className="rotation-table-wrap">
      <table className="compare-table rotation-table">
        <thead>
          <tr>
            <th>Leg</th>
            <th>Carrier</th>
            <th>Sched dep</th>
            <th>Actual dep</th>
            <th>Taxi out</th>
            <th>Wheels off</th>
            <th>Wheels on</th>
            <th>Taxi in</th>
            <th>Sched arr</th>
            <th>Actual arr</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, i) => {
            const groundGap = i < legs.length - 1
              ? formatGroundGap(leg.scheduled_ground_minutes, leg.actual_ground_minutes)
              : null;
            return (
              <Fragment key={`${leg.origin}-${leg.dest}-${i}`}>
                <tr>
                  <td>
                    {leg.origin} &rarr; {leg.dest}
                    {leg.cancelled && <span className="tile-value rust" style={{ fontSize: "0.75rem", marginLeft: 6 }}>Cancelled</span>}
                    {leg.diverted && <span className="tile-value rust" style={{ fontSize: "0.75rem", marginLeft: 6 }}>Diverted</span>}
                  </td>
                  <td>{leg.carrier}</td>
                  <td>{formatHHMM(leg.crs_dep_time)}</td>
                  <td>{formatHHMM(leg.dep_time)} <span className="page-note">({formatDelay(leg.dep_delay)})</span></td>
                  <td>{leg.taxi_out != null ? `${leg.taxi_out.toFixed(0)}m` : "\u2014"}</td>
                  <td>{formatHHMM(leg.wheels_off)}</td>
                  <td>{formatHHMM(leg.wheels_on)}</td>
                  <td>{leg.taxi_in != null ? `${leg.taxi_in.toFixed(0)}m` : "\u2014"}</td>
                  <td>{formatHHMM(leg.crs_arr_time)}</td>
                  <td>{formatHHMM(leg.arr_time)} <span className="page-note">({formatDelay(leg.arr_delay)})</span></td>
                </tr>
                {groundGap && (
                  <tr>
                    <td colSpan={10} className="page-note" style={{ paddingTop: 2, paddingBottom: 8 }}>
                      Ground time before next leg: {groundGap}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
