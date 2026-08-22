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

type Cause = { cause: string; cancelled_flights: number; share: number };

const COLORS = ["#c9563a", "#4f9d8f", "#5b7fa6", "#e8a33d"];

function CancellationTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const share = payload[0]?.payload?.share;
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
        {payload[0].value.toLocaleString()} cancelled flights
      </div>
      <div style={{ color: "#f3efe4", fontSize: "0.95rem" }}>
        {(share * 100).toFixed(1)}% of coded cancellations
      </div>
    </div>
  );
}

export default function CancellationCauseChart({ data }: { data: Cause[] }) {
  const chartData = [...data]
    .sort((a, b) => b.cancelled_flights - a.cancelled_flights)
    .map((d) => ({ cause: d.cause, cancelledFlights: d.cancelled_flights, share: d.share }));

  return (
    <div style={{ width: "100%", height: 240 }}>
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
            tickFormatter={(v) => v.toLocaleString()}
          />
          <YAxis type="category" dataKey="cause" tick={{ fontSize: 12, fill: "#9099a8" }} width={130} />
          <Tooltip content={<CancellationTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="cancelledFlights" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
