"use client";

type TurnaroundStratum = {
  label: string;
  pairs: number;
  correlation: number | null;
};

type DelayPropagationData = {
  pairs: number;
  correlation: number | null;
  avg_dep_delay_predecessor_on_time: number | null;
  avg_dep_delay_predecessor_late_15plus: number | null;
  avg_dep_delay_predecessor_late_60plus: number | null;
  turnaround_strata: TurnaroundStratum[];
};

function formatCorrelation(r: number | null): string {
  if (r == null || Number.isNaN(r)) return "\u2014";
  return r.toFixed(3);
}

function formatMinutes(m: number | null): string {
  if (m == null || Number.isNaN(m)) return "\u2014";
  return `${m.toFixed(1)} min`;
}

export default function DelayPropagationSummary({ data }: { data: DelayPropagationData }) {
  return (
    <div>
      <div className="board board-compact" style={{ marginBottom: "1.25rem" }}>
        <Tile label="Rotation pairs analyzed" value={data.pairs.toLocaleString()} />
        <Tile label="Overall correlation" value={formatCorrelation(data.correlation)} />
        <Tile label="Predecessor on-time \u2192 avg dep delay" value={formatMinutes(data.avg_dep_delay_predecessor_on_time)} />
        <Tile
          label="Predecessor 60+ min late \u2192 avg dep delay"
          value={formatMinutes(data.avg_dep_delay_predecessor_late_60plus)}
          tone="rust"
        />
      </div>

      <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>By scheduled turnaround tightness</p>
      <table className="compare-table">
        <thead>
          <tr>
            <th>Turnaround</th>
            <th>Pairs</th>
            <th>Correlation</th>
          </tr>
        </thead>
        <tbody>
          {data.turnaround_strata.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td>{s.pairs.toLocaleString()}</td>
              <td>{formatCorrelation(s.correlation)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
