"use client";

type TurnbackData = {
  total_flights: number;
  turnback_flights: number;
  turnback_rate: number;
  avg_add_gtime_minutes: number | null;
  turnback_on_time_rate: number | null;
  non_turnback_on_time_rate: number | null;
};

export default function TurnbackSummary({ data }: { data: TurnbackData }) {
  const hasTurnbacks = data.turnback_flights > 0;

  return (
    <div>
      <div className="board board-compact" style={{ marginBottom: "1.25rem" }}>
        <Tile label="Turnback flights" value={data.turnback_flights.toLocaleString()} />
        <Tile
          label="Turnback rate"
          value={`${(data.turnback_rate * 100).toFixed(3)}%`}
          tone="rust"
        />
        <Tile
          label="Avg extra ground time"
          value={data.avg_add_gtime_minutes != null ? `${data.avg_add_gtime_minutes.toFixed(0)} min` : "\u2014"}
          tone="rust"
        />
      </div>

      {hasTurnbacks ? (
        <div className="direction-stats">
          <div>
            <span className="tile-label">Turnback flights &mdash; on-time</span>
            <span className="tile-value" style={{ fontSize: "1.2rem" }}>
              {data.turnback_on_time_rate != null ? `${(data.turnback_on_time_rate * 100).toFixed(1)}%` : "\u2014"}
            </span>
          </div>
          <div>
            <span className="tile-label">Normal flights &mdash; on-time</span>
            <span className="tile-value" style={{ fontSize: "1.2rem" }}>
              {data.non_turnback_on_time_rate != null ? `${(data.non_turnback_on_time_rate * 100).toFixed(1)}%` : "\u2014"}
            </span>
          </div>
        </div>
      ) : (
        <p className="page-note">No turnback flights in this scope.</p>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "rust" }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className={`tile-value ${tone === "rust" ? "rust" : ""}`}>{value}</span>
    </div>
  );
}
