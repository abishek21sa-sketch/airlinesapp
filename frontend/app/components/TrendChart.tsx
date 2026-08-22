"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type MonthPoint = {
  month: string;
  total_flights: number;
  on_time_rate: number;
};

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: "#1a2029",
        border: "1px solid #2e3542",
        borderRadius: 4,
        padding: "0.6rem 0.85rem",
      }}
    >
      <div style={{ color: "#9099a8", fontSize: "0.8rem", marginBottom: 4 }}>Month: {label}</div>
      <div style={{ color: "#f3efe4", fontSize: "0.95rem" }}>
        On-time rate: {payload[0].value}%
      </div>
    </div>
  );
}

export default function TrendChart({ data }: { data: MonthPoint[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    onTimePct: Math.round(d.on_time_rate * 1000) / 10,
  }));

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3542" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#9099a8" }}
            interval={11}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9099a8" }}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<TrendTooltip />} />
          <Line
            type="monotone"
            dataKey="onTimePct"
            stroke="#e8a33d"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
