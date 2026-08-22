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

type LandingBucket = {
  bucket: string;
  diverted_flights: number;
  reached_destination_rate: number;
};

// Same color scale as elsewhere, applied here to "reached original
// destination" rate rather than on-time rate -- still a 0-100% success
// metric, so the same bands read naturally.
function colorForRate(rate: number): string {
  if (rate >= 0.8) return "#4f9d8f";
  if (rate >= 0.7) return "#e8a33d";
  return "#c9563a";
}

function LandingTooltip({ active, payload, label }: any) {
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
        {d.divertedFlights.toLocaleString()} diverted flights
      </div>
      <div style={{ color: "#f3efe4", fontSize: "0.9rem" }}>
        {(d.reachedDestinationRate * 100).toFixed(1)}% eventually reached original destination
      </div>
    </div>
  );
}

export default function DiversionLandingChart({ data }: { data: LandingBucket[] }) {
  const chartData = data.map((d) => ({
    bucket: d.bucket,
    divertedFlights: d.diverted_flights,
    reachedDestinationRate: d.reached_destination_rate,
  }));

  return (
    <div style={{ width: "100%", height: 220 }}>
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
          <YAxis type="category" dataKey="bucket" tick={{ fontSize: 12, fill: "#9099a8" }} width={100} />
          <Tooltip content={<LandingTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="divertedFlights" radius={[0, 4, 4, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={colorForRate(d.reachedDestinationRate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="route-legend">
        <span><i style={{ background: "#4f9d8f" }} /> 80%+ reached dest.</span>
        <span><i style={{ background: "#e8a33d" }} /> 70-80%</span>
        <span><i style={{ background: "#c9563a" }} /> under 70%</span>
      </div>
    </div>
  );
}
