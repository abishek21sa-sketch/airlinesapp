"use client";

import { useState } from "react";
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

export type ScenarioTrend = {
  key: string;
  label: string;
  color: string;
  dash?: string;
  months: { month: string; on_time_rate: number }[];
};

function CompareTooltip({ active, payload, label }: any) {
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
      <div style={{ color: "#9099a8", fontSize: "0.8rem", marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, fontSize: "0.9rem" }}>
          {p.name}: {p.value != null ? `${p.value}%` : "no data"}
        </div>
      ))}
    </div>
  );
}

export default function ComparisonChart({ scenarios }: { scenarios: ScenarioTrend[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggleLine(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Merge all scenarios' monthly data into one unified array keyed by month,
  // since different scenarios may cover different (or partially overlapping) ranges.
  const monthSet = new Set<string>();
  scenarios.forEach((s) => s.months.forEach((m) => monthSet.add(m.month)));
  const allMonths = Array.from(monthSet).sort();

  const merged = allMonths.map((month) => {
    const row: Record<string, string | number | null> = { month };
    scenarios.forEach((s) => {
      const point = s.months.find((m) => m.month === month);
      row[s.key] = point ? Math.round(point.on_time_rate * 1000) / 10 : null;
    });
    return row;
  });

  return (
    <div style={{ width: "100%", height: 380 }}>
      <ResponsiveContainer>
        <LineChart data={merged} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3542" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#9099a8" }}
            interval={Math.max(0, Math.floor(allMonths.length / 12))}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9099a8" }}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<CompareTooltip />} />
          <Legend
            wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#9099a8", cursor: "pointer" }}
            onClick={(e: any) => toggleLine(e.dataKey)}
            formatter={(value: string, entry: any) => (
              <span style={{ opacity: hidden.has(entry.dataKey) ? 0.35 : 1 }}>{value}</span>
            )}
          />
          {scenarios.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dash}
              dot={false}
              connectNulls={false}
              hide={hidden.has(s.key)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
