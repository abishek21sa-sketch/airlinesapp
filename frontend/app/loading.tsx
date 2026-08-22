export default function Loading() {
  return (
    <main className="page">
      <header className="header">
        <div className="skeleton skeleton-eyebrow" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-subtitle" />
      </header>

      <div className="board">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tile">
            <div className="skeleton skeleton-tile-label" />
            <div className="skeleton skeleton-tile-value" />
          </div>
        ))}
      </div>

      {[0, 1, 2, 3].map((i) => (
        <section key={i} className="section">
          <div className="section-head">
            <div className="skeleton skeleton-section-title" />
          </div>
          <div className="screen">
            <div className="skeleton skeleton-chart" />
          </div>
        </section>
      ))}
    </main>
  );
}
