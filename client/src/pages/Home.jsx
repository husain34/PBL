import React from "react";

function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12">
      
      {/* Hero Section */}
      <section className="max-w-6xl mx-auto text-center mb-16">
        <h1 className="text-5xl font-bold mb-6">
          OPTIFOLIO 📊
        </h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          A Modern Portfolio Optimization System built on 
          <span className="font-semibold text-primary"> Modern Portfolio Theory</span>. 
          OPTIFOLIO empowers investors with risk-based allocation, 
          efficient frontier visualization, and intelligent rebalancing strategies.
        </p>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-8">

        {/* Feature 1 */}
        <div className="auth-card">
          <h2 className="text-xl font-semibold mb-3 text-primary">
            1️⃣ Risk-Based Portfolio Construction
          </h2>
          <p className="text-muted-foreground">
            Generate optimized asset allocations tailored to investor risk profiles 
            — Low, Medium, and High — ensuring alignment with individual return expectations 
            and risk tolerance.
          </p>
        </div>

        {/* Feature 2 */}
        <div className="auth-card">
          <h2 className="text-xl font-semibold mb-3 text-primary">
            2️⃣ Efficient Frontier Visualization
          </h2>
          <p className="text-muted-foreground">
            Compute and visualize the Efficient Frontier to identify optimal portfolios 
            that provide the highest expected return for a given level of risk using 
            quantitative modeling.
          </p>
        </div>

        {/* Feature 3 */}
        <div className="auth-card">
          <h2 className="text-xl font-semibold mb-3 text-primary">
            3️⃣ Maximum Sharpe Ratio Portfolio
          </h2>
          <p className="text-muted-foreground">
            Identify the portfolio offering the best risk-adjusted return 
            by maximizing the Sharpe Ratio — balancing volatility against 
            excess returns over the risk-free rate.
          </p>
        </div>

        {/* Feature 4 */}
        <div className="auth-card">
          <h2 className="text-xl font-semibold mb-3 text-primary">
            4️⃣ Diversification Analysis
          </h2>
          <p className="text-muted-foreground">
            Analyze asset correlations and concentration levels to detect 
            overexposure, reduce systematic risk, and improve portfolio diversification.
          </p>
        </div>

        {/* Feature 5 */}
        <div className="auth-card md:col-span-2 lg:col-span-1">
          <h2 className="text-xl font-semibold mb-3 text-primary">
            5️⃣ Model-Based Rebalancing Simulation
          </h2>
          <p className="text-muted-foreground">
            Compare a user’s current allocation with optimized model weights 
            and simulate rebalancing adjustments to enhance long-term performance 
            and stability.
          </p>
        </div>

      </section>

      {/* Footer / CTA */}
      <section className="max-w-6xl mx-auto text-center mt-20">
        <p className="text-lg text-muted-foreground mb-6">
          Built for data-driven investors who value optimization, precision, and performance.
        </p>
        <button className="bg-primary text-primary-foreground px-8 py-3 rounded-xl font-semibold shadow-md hover:opacity-90 transition">
          Get Started
        </button>
      </section>

    </div>
  );
}

export default Home;