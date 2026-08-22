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

type Cause = {
  cause: string;
  minutes: number;
  share: number;
};

// One distinct color per cause, drawn from the same board palette family
// (warm ink/slate tones) rather than a generic rainbow.
const CAUSE_COLORS: Record<string, string> = {
  "Late Aircraft": "#c9563a", // rust
  Carrier: "#e8a33d", // amber
  NAS: "#5b7fa6", // slate blue
  Weather: "#4f9d8f", // teal
  Security: "#8a6642", // bronze
};

function CauseTooltip({ active, payload, label }: any) {
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
      <div style={{ color: "#f3efe4", fontSize: "0.95rem" }}>
        Share of delay-minutes: {payload[0].value}%
      </div>
    </div>
  );
}

export default function DelayCauseChart({ data }: { data: Cause[] }) {
  const chartData = [...data]
    .sort((a, b) => b.share - a.share)
    .map((d) => ({
      cause: d.cause,
      sharePct: Math.round(d.share * 1000) / 10,
    }));

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3542" />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "#9099a8" }}
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="cause"
            tick={{ fontSize: 12, fill: "#9099a8" }}
            width={90}
          />
          <Tooltip content={<CauseTooltip />} cursor={{ fill: "rgba(255, 255, 255, 0.04)" }} />
          <Bar dataKey="sharePct" radius={[0, 4, 4, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={CAUSE_COLORS[d.cause] ?? "#9099a8"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
