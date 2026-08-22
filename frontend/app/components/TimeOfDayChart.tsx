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

type HourStat = {
  scheduled_hour: number;
  total_flights: number;
  on_time_rate: number;
  avg_arrival_delay_minutes: number;
};

function hourLabel(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

function colorForOnTimeRate(rate: number): string {
  if (rate >= 0.8) return "#4f9d8f";
  if (rate >= 0.7) return "#e8a33d";
  return "#c9563a";
}

function TimeOfDayTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d: HourStat = payload[0].payload;
  return (
    <div
      style={{
        background: "#1a2029",
        border: "1px solid #2e3542",
        borderRadius: 4,
        padding: "0.6rem 0.85rem",
      }}
    >
      <div style={{ color: "#9099a8", fontSize: "0.8rem", marginBottom: 4 }}>
        Scheduled {hourLabel(d.scheduled_hour)}
      </div>
      <div style={{ color: "#f3efe4", fontSize: "0.95rem" }}>
        {(d.on_time_rate * 100).toFixed(1)}% on-time
      </div>
      <div style={{ color: "#f3efe4", fontSize: "0.95rem" }}>
        {d.avg_arrival_delay_minutes.toFixed(1)} min avg delay
      </div>
      <div style={{ color: "#9099a8", fontSize: "0.78rem", marginTop: 4 }}>
        {d.total_flights.toLocaleString()} flights
      </div>
    </div>
  );
}

export default function TimeOfDayChart({ data }: { data: HourStat[] }) {
  const chartData = [...data]
    .sort((a, b) => a.scheduled_hour - b.scheduled_hour)
    .map((d) => ({ ...d, onTimePct: Math.round(d.on_time_rate * 1000) / 10 }));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3542" />
          <XAxis
            dataKey="scheduled_hour"
            tickFormatter={hourLabel}
            tick={{ fontSize: 10, fill: "#9099a8" }}
            interval={1}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "#9099a8" }}
          />
          <Tooltip content={<TimeOfDayTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="onTimePct" radius={[3, 3, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={colorForOnTimeRate(d.on_time_rate)} />
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
