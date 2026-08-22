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

type CodeshareGroup = {
  group: string;
  total_flights: number;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
  cancellation_rate: number;
  share: number;
};

function colorForOnTimeRate(rate: number): string {
  if (rate >= 0.8) return "#4f9d8f";
  if (rate >= 0.7) return "#e8a33d";
  return "#c9563a";
}

function CodeshareTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div
      style={{
        background: "#1a2029",
        border: "1px solid #2e3542",
        borderRadius: 4,
        padding: "0.6rem 0.85rem",
      }}
    >
      <div style={{ color: "#9099a8", fontSize: "0.8rem", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#f3efe4", fontSize: "0.95rem" }}>
        {(d.onTimeRate * 100).toFixed(1)}% on-time
      </div>
      <div style={{ color: "#f3efe4", fontSize: "0.9rem" }}>
        {d.totalFlights.toLocaleString()} flights ({(d.share * 100).toFixed(1)}% of scope)
      </div>
      <div style={{ color: "#9099a8", fontSize: "0.8rem", marginTop: 4 }}>
        {d.avgArrivalDelayMinutes.toFixed(1)} min avg delay &middot;{" "}
        {(d.cancellationRate * 100).toFixed(2)}% cancelled
      </div>
    </div>
  );
}

export default function CodeshareChart({ data }: { data: CodeshareGroup[] }) {
  const chartData = data.map((d) => ({
    group: d.group,
    onTimeRate: d.on_time_rate,
    totalFlights: d.total_flights,
    avgArrivalDelayMinutes: d.avg_arrival_delay_minutes,
    cancellationRate: d.cancellation_rate,
    share: d.share,
  }));

  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3542" />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: "#9099a8" }}
          />
          <YAxis type="category" dataKey="group" tick={{ fontSize: 12, fill: "#9099a8" }} width={140} />
          <Tooltip content={<CodeshareTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="onTimeRate" radius={[0, 4, 4, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={colorForOnTimeRate(d.onTimeRate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="route-legend">
        <span><i style={{ background: "#4f9d8f" }} /> 80%+ on-time</span>
        <span><i style={{ background: "#e8a33d" }} /> 70-80%</span>
        <span><i style={{ background: "#c9563a" }} /> under 70%</span>
      </div>
    </div>
  );
}
