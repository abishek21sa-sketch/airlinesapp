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

type Route = {
  route: string;
  total_flights: number;
  on_time_rate: number;
};

// Color the bar by on-time rate so the chart carries two dimensions at once:
// bar length = volume, bar color = reliability.
function colorForOnTimeRate(rate: number): string {
  if (rate >= 0.8) return "#4f9d8f"; // teal -- strong
  if (rate >= 0.7) return "#e8a33d"; // amber -- typical
  return "#c9563a"; // rust -- weak
}

function RouteTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const onTimeRate = payload[0]?.payload?.onTimeRate;
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
      <div style={{ color: "#f3efe4", fontSize: "0.95rem" }}>
        {(onTimeRate * 100).toFixed(1)}% on-time
      </div>
    </div>
  );
}

export default function RouteChart({ data }: { data: Route[] }) {
  const chartData = [...data]
    .sort((a, b) => b.total_flights - a.total_flights)
    .map((d) => ({
      route: d.route,
      totalFlights: d.total_flights,
      onTimeRate: d.on_time_rate,
    }));

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
            dataKey="route"
            tick={{ fontSize: 11, fill: "#9099a8" }}
            width={100}
          />
          <Tooltip content={<RouteTooltip />} cursor={{ fill: "rgba(255, 255, 255, 0.04)" }} />
          <Bar dataKey="totalFlights" radius={[0, 4, 4, 0]}>
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
