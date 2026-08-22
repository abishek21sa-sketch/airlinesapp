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

type MonthPoint = { month: string; all_flights: number; max_tail_flights: number };

function TimelineTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const d: MonthPoint = payload[0]?.payload;
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
      <div style={{ color: "#e8a33d", fontSize: "0.9rem" }}>
        All flights (carrier set): {d.all_flights.toLocaleString()}
      </div>
      <div style={{ color: "#4f9d8f", fontSize: "0.9rem" }}>
        Grounded-MAX-tail flights: {d.max_tail_flights.toLocaleString()}
      </div>
    </div>
  );
}

export default function MaxTimelineChart({ data }: { data: MonthPoint[] }) {
  const chartData = [...data].sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3542" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "#9099a8" }}
            angle={-45}
            textAnchor="end"
            height={50}
            interval={Math.max(0, Math.floor(chartData.length / 15))}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: "#9099a8" }}
            tickFormatter={(v) => v.toLocaleString()}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "#9099a8" }}
            tickFormatter={(v) => v.toLocaleString()}
          />
          <Tooltip content={<TimelineTooltip />} />
          <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#9099a8" }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="all_flights"
            name="All flights (carrier set)"
            stroke="#e8a33d"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="max_tail_flights"
            name="Grounded-MAX-tail flights"
            stroke="#4f9d8f"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
