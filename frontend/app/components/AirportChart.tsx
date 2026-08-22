"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Airport = {
  airport: string;
  total_flights: number;
};

function AirportTooltip({ active, payload, label }: any) {
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
        {payload[0].value.toLocaleString()} flights
      </div>
    </div>
  );
}

export default function AirportChart({ data }: { data: Airport[] }) {
  const chartData = [...data]
    .sort((a, b) => b.total_flights - a.total_flights)
    .map((d) => ({ airport: d.airport, totalFlights: d.total_flights }));

  return (
    <div style={{ width: "100%", height: 420 }}>
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
          <YAxis
            type="category"
            dataKey="airport"
            tick={{ fontSize: 12, fill: "#9099a8" }}
            width={50}
          />
          <Tooltip content={<AirportTooltip />} cursor={{ fill: "rgba(232, 163, 61, 0.08)" }} />
          <Bar dataKey="totalFlights" fill="#e8a33d" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
