"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type Bank = {
  scheduled_hour: number;
  scheduled_departures: number;
  effective_capacity: number;
  avg_departure_delay: number;
  avg_taxi_out: number | null;
  queue_pressure_score: number;
  pressure_state: string;
  evidence_sufficient: boolean;
  utilization: number;
};

type Threshold = {
  status: string;
  utilization_threshold?: number;
  below_threshold_mean_departure_delay?: number;
  above_threshold_mean_departure_delay?: number;
  delay_uplift_minutes?: number;
};

type QueuePressure = {
  status: string;
  departure_banks: Bank[];
  summary: {
    eligible_bank_count: number;
    excluded_low_evidence_banks: number;
    high_or_critical_banks: number;
    overload_start_hour: number | null;
    recovery_hour: number | null;
    highest_pressure_bank: Bank | null;
    congestion_threshold: Threshold;
  };
  methodology: {
    framework: string;
    effective_capacity: string;
    weights: Record<string, number>;
    limitations: string[];
  };
};

const STATE_COLORS: Record<string, string> = {
  low: "#4f9d8f",
  moderate: "#e8a33d",
  high: "#d17b3e",
  critical: "#c9563a",
  insufficient_evidence: "#4a5568",
};

function hourLabel(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

function QueueTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const bank: Bank = payload[0].payload;
  if (!bank.evidence_sufficient) {
    return (
      <div className="queue-tooltip">
        <div className="queue-tooltip-hour">{hourLabel(bank.scheduled_hour)}</div>
        <div className="queue-tooltip-status">Insufficient evidence for this hour</div>
      </div>
    );
  }
  return (
    <div className="queue-tooltip">
      <div className="queue-tooltip-hour">{hourLabel(bank.scheduled_hour)}</div>
      <div>Pressure: {bank.queue_pressure_score.toFixed(0)} ({bank.pressure_state})</div>
      <div>Utilization: {(bank.utilization * 100).toFixed(0)}%</div>
      <div>Avg departure delay: {bank.avg_departure_delay.toFixed(1)} min</div>
      {bank.avg_taxi_out != null && <div>Avg taxi-out: {bank.avg_taxi_out.toFixed(1)} min</div>}
    </div>
  );
}

export default function QueuePressureSection({ data }: { data: QueuePressure | null }) {
  if (!data) return null;

  const { summary, methodology, departure_banks } = data;
  const threshold = summary.congestion_threshold;

  return (
    <div className="queue-pressure-section">
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={departure_banks} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3542" />
            <XAxis
              dataKey="scheduled_hour"
              tickFormatter={hourLabel}
              tick={{ fontSize: 10, fill: "#9099a8" }}
              interval={1}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9099a8" }} />
            <Tooltip content={<QueueTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="queue_pressure_score" radius={[3, 3, 0, 0]}>
              {departure_banks.map((b, i) => (
                <Cell key={i} fill={STATE_COLORS[b.pressure_state] ?? "#4a5568"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="queue-legend">
        <span><i style={{ background: STATE_COLORS.low }} /> Low</span>
        <span><i style={{ background: STATE_COLORS.moderate }} /> Moderate</span>
        <span><i style={{ background: STATE_COLORS.high }} /> High</span>
        <span><i style={{ background: STATE_COLORS.critical }} /> Critical</span>
        <span><i style={{ background: STATE_COLORS.insufficient_evidence }} /> Insufficient evidence</span>
      </div>

      <div className="queue-summary">
        {summary.overload_start_hour != null ? (
          <p>
            Congestion typically builds starting around <strong>{hourLabel(summary.overload_start_hour)}</strong>
            {summary.recovery_hour != null && (
              <> and eases back down by <strong>{hourLabel(summary.recovery_hour)}</strong></>
            )}
            . {summary.high_or_critical_banks} of {summary.eligible_bank_count} scoreable hours run high or critical.
          </p>
        ) : (
          <p>No hours reached high or critical pressure in this window.</p>
        )}

        {threshold.status === "detected" && (
          <p>
            Once scheduled departures pass roughly <strong>{((threshold.utilization_threshold ?? 0) * 100).toFixed(0)}%</strong> of
            estimated capacity, average departure delay jumps from{" "}
            <strong>{threshold.below_threshold_mean_departure_delay?.toFixed(1)} min</strong> to{" "}
            <strong>{threshold.above_threshold_mean_departure_delay?.toFixed(1)} min</strong> &mdash; an empirically detected
            threshold, not an assumed one.
          </p>
        )}
        {threshold.status === "no_adverse_threshold" && (
          <p>No utilization level in this window produced a meaningful jump in departure delay.</p>
        )}
        {threshold.status === "insufficient_evidence" && (
          <p>Not enough evidence-eligible hours in this window to test for a congestion threshold.</p>
        )}

        {summary.excluded_low_evidence_banks > 0 && (
          <p className="page-note">
            {summary.excluded_low_evidence_banks} hour(s) excluded for insufficient evidence (too few
            scheduled departures or too few observed days) rather than scored on thin data.
          </p>
        )}
      </div>

      <details className="health-methodology">
        <summary>How this is calculated</summary>
        <div className="health-methodology-body">
          <p>{methodology.framework}</p>
          <p><strong>Effective capacity:</strong> {methodology.effective_capacity}</p>
          <ul>
            {Object.entries(methodology.weights).map(([k, v]) => (
              <li key={k}><strong>{k.replace(/_/g, " ")}</strong>: {(v * 100).toFixed(0)}%</li>
            ))}
          </ul>
          <p><strong>Honest limitations:</strong></p>
          <ul>
            {methodology.limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      </details>
    </div>
  );
}
