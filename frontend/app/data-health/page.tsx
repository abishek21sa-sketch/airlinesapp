import Link from "next/link";
import { carrierName } from "../lib/carriers";
import AutomatedCheckPanel from "../components/AutomatedCheckPanel";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type CarrierRow = {
  carrier: string;
  total_flights: number;
  start_date: string;
  end_date: string;
};

type PipelineCheck = {
  checked_at: string | null;
  result: string | null;
  months_added: string[];
} | null;

type DataHealth = {
  total_flights: number;
  start_date: string;
  end_date: string;
  carrier_count: number;
  months_covered: number;
  expected_months: number;
  missing_months: string[];
  column_count: number;
  warehouse_size_mb: number | null;
  last_automated_check: PipelineCheck;
  carriers: CarrierRow[];
};

async function getHealth(): Promise<DataHealth | null> {
  try {
    const res = await fetch(`${API_BASE}/api/data-health`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DataHealthPage() {
  const health = await getHealth();

  if (!health) {
    return (
      <main className="page">
        <p className="eyebrow">Connection error</p>
        <h1 className="title">Could not reach the API</h1>
        <p className="error-text">Is FastAPI running at NEXT_PUBLIC_API_BASE_URL?</p>
      </main>
    );
  }

  const complete = health.missing_months.length === 0;

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">DOT On-Time Performance &middot; Data Health</p>
        <h1 className="title">Is this data current?</h1>
        <p className="subtitle">
          Facts about the warehouse itself &mdash; not analysis, just whether you can trust what you're looking at.
          {" "}Curious how the Health Scores on Routes/Carriers/Airports are calculated?{" "}
          <Link href="/methodology" style={{ color: "var(--amber)" }}>See the methodology &rarr;</Link>
        </p>
      </header>

      <div className="board">
        <Tile label="Total flights" value={health.total_flights.toLocaleString()} />
        <Tile label="Months covered" value={`${health.months_covered} / ${health.expected_months}`} />
        <Tile label="Carriers" value={health.carrier_count.toString()} />
        <Tile label="Raw columns" value={health.column_count.toString()} />
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Coverage status</h2>
        </div>
        <div className="screen">
          <p className={`health-status ${complete ? "health-ok" : "health-gap"}`}>
            {complete
              ? `\u2713 Complete monthly coverage, ${health.start_date} through ${health.end_date}.`
              : `\u26a0 ${health.missing_months.length} month(s) missing within the covered range.`}
          </p>
          {!complete && (
            <p className="health-detail mono">Missing: {health.missing_months.join(", ")}</p>
          )}
          <p className="health-detail">
            Source data spans {health.start_date} to {health.end_date}. New months are typically
            published by DOT/BTS with roughly a two-month lag from the current date, so a recent
            gap at the far end of the range is expected, not a data-pipeline failure.
          </p>
          {health.warehouse_size_mb != null && (
            <p className="health-detail mono">Warehouse file size: {health.warehouse_size_mb} MB</p>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Automated data check</h2>
        </div>
        <div className="screen">
          <AutomatedCheckPanel initial={health.last_automated_check} />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Why only {health.carrier_count} carriers?</h2>
        </div>
        <div className="screen">
          <p className="health-detail">
            This isn&apos;t a gap in our pipeline &mdash; it&apos;s how the federal reporting
            requirement works. BTS on-time performance reporting (14 CFR Part 234) only applies
            to airlines that individually account for at least 0.5% of total domestic scheduled
            passenger revenue. That threshold currently limits mandatory reporting to a short list
            of major carriers.
          </p>
          <p className="health-detail">
            This dataset also reports by &ldquo;marketing&rdquo; carrier, not operating carrier
            &mdash; regional partners that fly under a major airline&apos;s brand (e.g. the
            carriers actually flying &ldquo;United Express&rdquo; or &ldquo;American
            Eagle&rdquo; routes) are folded into their partner&apos;s code rather than listed
            separately. So actual flight coverage is broader than {health.carrier_count} rows
            suggests &mdash; it&apos;s organized by the brand on the ticket, which is also the
            right level for browsing this site.
          </p>
          <p className="health-detail">
            One confirmation already visible in the table below: Virgin America (VX) stops
            appearing after March 2018 &mdash; not a data error, but the actual month Virgin
            America merged into Alaska Airlines.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Per-carrier coverage</h2>
          <span className="section-note">Record count and date range for each carrier</span>
        </div>
        <div className="screen" style={{ overflowX: "auto" }}>
          <table className="compare-table">
            <thead>
              <tr>
                <th>Carrier</th>
                <th>Flights</th>
                <th>First flight</th>
                <th>Last flight</th>
              </tr>
            </thead>
            <tbody>
              {health.carriers.map((c) => (
                <tr key={c.carrier}>
                  <td>
                    {c.carrier} &mdash; {carrierName(c.carrier)}
                  </td>
                  <td>{c.total_flights.toLocaleString()}</td>
                  <td>{c.start_date}</td>
                  <td>{c.end_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
    </div>
  );
}
