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

type QueryGroup = {
  group: string;
  total_flights: number;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
  avg_departure_delay_minutes: number;
  cancellation_rate: number;
};

function colorForOnTimeRate(rate: number): string {
  if (rate >= 0.8) return "#4f9d8f";
  if (rate >= 0.7) return "#e8a33d";
  return "#c9563a";
}

function FlexibleQueryTooltip({ active, payload, label }: any) {
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
      <div style={{ color: "#9099a8", fontSize: "0.8rem", marginTop: 4 }}>
        {d.totalFlights.toLocaleString()} flights &middot; {d.avgArrivalDelayMinutes.toFixed(1)} min avg delay
      </div>
    </div>
  );
}

export default function FlexibleQueryChart({ groups }: { groups: QueryGroup[] }) {
  const chartData = groups.map((g) => ({
    group: g.group,
    onTimeRate: g.on_time_rate,
    totalFlights: g.total_flights,
    avgArrivalDelayMinutes: g.avg_arrival_delay_minutes,
  }));

  return (
    <div style={{ width: "100%", height: Math.max(160, chartData.length * 36 + 40) }}>
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
          <YAxis type="category" dataKey="group" tick={{ fontSize: 12, fill: "#9099a8" }} width={110} />
          <Tooltip content={<FlexibleQueryTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
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
