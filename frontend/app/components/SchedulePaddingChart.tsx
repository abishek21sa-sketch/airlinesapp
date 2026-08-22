"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type PeriodStat = {
  period: string;
  total_flights: number;
  avg_scheduled_minutes: number;
  avg_actual_minutes: number;
  padding_minutes: number;
};

function PaddingTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const d: PeriodStat = payload[0]?.payload;
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
      <div style={{ color: "#e8a33d", fontSize: "0.9rem" }}>
        Scheduled: {d.avg_scheduled_minutes.toFixed(1)} min
      </div>
      <div style={{ color: "#4f9d8f", fontSize: "0.9rem" }}>
        Actual: {d.avg_actual_minutes.toFixed(1)} min
      </div>
      <div style={{ color: "#f3efe4", fontSize: "0.9rem", marginTop: 4 }}>
        Padding: {d.padding_minutes.toFixed(1)} min
      </div>
      <div style={{ color: "#9099a8", fontSize: "0.75rem", marginTop: 4 }}>
        {d.total_flights.toLocaleString()} flights
      </div>
    </div>
  );
}

export default function SchedulePaddingChart({ data }: { data: PeriodStat[] }) {
  const chartData = [...data].sort((a, b) => a.period.localeCompare(b.period));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3542" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 10, fill: "#9099a8" }}
            angle={chartData.length > 12 ? -45 : 0}
            textAnchor={chartData.length > 12 ? "end" : "middle"}
            height={chartData.length > 12 ? 50 : 30}
            interval={Math.max(0, Math.floor(chartData.length / 15))}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9099a8" }}
            tickFormatter={(v) => `${Math.round(v)}m`}
            domain={["auto", "auto"]}
            tickCount={5}
          />
          <Tooltip content={<PaddingTooltip />} />
          <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#9099a8" }} />
          <Line
            type="monotone"
            dataKey="avg_scheduled_minutes"
            name="Scheduled time"
            stroke="#e8a33d"
            strokeWidth={2}
            dot={chartData.length <= 30}
          />
          <Line
            type="monotone"
            dataKey="avg_actual_minutes"
            name="Actual time"
            stroke="#4f9d8f"
            strokeWidth={2}
            dot={chartData.length <= 30}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
