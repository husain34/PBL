import React from "react";

const overviewCards = [
  {
    label: "Portfolio Value",
    title: "No live value",
    note: "Connect real portfolio data to display this card.",
    tone: "sky",
  },
  {
    label: "Expected Return",
    title: "Not available yet",
    note: "This section should use actual optimization results only.",
    tone: "lavender",
  },
  {
    label: "Portfolio Risk",
    title: "No computed risk",
    note: "Risk metrics will appear when real analysis is connected.",
    tone: "mint",
  },
];

const quickPoints = [
  "Risk-based portfolio construction",
  "Efficient frontier visualization",
  "Maximum Sharpe ratio support",
  "Diversification analysis",
];

function Home() {
  return (
    <div className="dashboard-shell">
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">Portfolio Overview</p>
          <h1 className="dashboard-title">Portfolio Optimization Dashboard</h1>
          <p className="dashboard-subtitle">
            A clean dashboard layout for your project without showing any made-up numbers or sample financial records.
          </p>
        </div>
      </section>

      <section className="overview-grid">
        {overviewCards.map((card) => (
          <article key={card.label} className={`overview-card overview-card-${card.tone}`}>
            <p className="overview-label">{card.label}</p>
            <h2 className="overview-value overview-value-muted">{card.title}</h2>
            <p className="overview-note overview-note-muted">{card.note}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-main-grid">
        <div className="dashboard-left-column">
          <article className="panel-card">
            <div className="panel-header">
              <div>
                <h3>Project Summary</h3>
                <p>Main purpose of the system</p>
              </div>
            </div>

            <div className="dashboard-empty-state dashboard-empty-state-tall">
              <div className="dashboard-empty-icon dashboard-empty-icon-violet">PT</div>
              <p className="dashboard-empty-title">Project Expense Tracking Software</p>
              <p className="dashboard-empty-copy dashboard-empty-copy-wide">
                This dashboard layout is ready for real data, but currently avoids fake financial values. Use your backend or actual analysis output to populate cards, charts, and tables.
              </p>
            </div>
          </article>

          <article className="panel-card">
            <div className="panel-header">
              <div>
                <h3>Key Features</h3>
                <p>What the platform is designed to support</p>
              </div>
            </div>

            <div className="dashboard-bullet-list">
              {quickPoints.map((point) => (
                <div key={point} className="dashboard-bullet-item dashboard-bullet-item-start">
                  <span className="dashboard-bullet-dot" />
                  <p>{point}</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <article className="panel-card transactions-panel">
          <div className="panel-header">
            <div>
              <h3>Latest Activity</h3>
              <p>This area is intentionally left without sample records</p>
            </div>
          </div>

          <div className="dashboard-empty-state dashboard-empty-state-tall">
            <div className="dashboard-empty-icon dashboard-empty-icon-sky">--</div>
            <p className="dashboard-empty-title">No fake activity shown</p>
            <p className="dashboard-empty-copy dashboard-empty-copy-wide">
              Add real transactions, portfolio logs, or backend-driven activity here when you are ready. Until then, this section stays clean and truthful.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}

export default Home;
