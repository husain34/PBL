import React, { useState, useEffect, useCallback } from "react";
import axios from "../api/axios";
import {
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";

const API = "/portfolio";

function formatFullINR(v) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);
}
function formatINR(v) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);
}

const CATEGORIES = ["Large Cap", "Mid Cap", "Small Cap"];
const CAT_COLORS = {
  "Large Cap": "#3b82f6", // blue
  "Mid Cap": "#8b5cf6",   // violet
  "Small Cap": "#ec4899"  // pink
};

const EMPTY_FORM = {
  symbol: "",
  quantity: "",
  priceBoughtAt: "",
  purchaseDate: new Date().toISOString().split("T")[0]
};

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState("holdings");
  const [holdings, setHoldings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [riskAnalysis, setRiskAnalysis] = useState(null);
  const [sectorAnalysis, setSectorAnalysis] = useState(null);
  const [correlationAudit, setCorrelationAudit] = useState(null);
  const [selectedStockSymbol, setSelectedStockSymbol] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchHoldings = useCallback(async () => {
    try {
      const res = await axios.get(API, { headers });
      setHoldings(res.data);
    } catch (err) {
      console.error("Fetch holdings error", err);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/summary`, { headers });
      setSummary(res.data);
    } catch (err) {
      console.error("Fetch summary error", err);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/suggestions`, { headers });
      setSuggestions(res.data);
    } catch (err) {
      console.error("Fetch suggestions error", err);
    }
  }, []);

  const fetchRiskAnalysis = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/risk-analysis`, { headers });
      setRiskAnalysis(res.data);
    } catch (err) {
      console.error("Fetch risk analysis error", err);
    }
  }, []);

  const fetchSectorAnalysis = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/sector-analysis`, { headers });
      setSectorAnalysis(res.data);
    } catch (err) {
      console.error("Fetch sector analysis error", err);
    }
  }, []);

  const fetchCorrelationAudit = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/correlation-audit`, { headers });
      setCorrelationAudit(res.data);
    } catch (err) {
      console.error("Fetch correlation audit error", err);
    }
  }, []);

  useEffect(() => {
    fetchHoldings();
    if (activeTab === "analytics" || activeTab === "comparison" || activeTab === "suggestions" || activeTab === "risk engine" || activeTab === "smart insights") {
       fetchSummary();
    }
    if (activeTab === "suggestions") {
       fetchSuggestions();
    }
    if (activeTab === "risk engine") {
       fetchRiskAnalysis();
    }
    if (activeTab === "smart insights") {
       fetchSectorAnalysis();
       fetchCorrelationAudit();
    }
  }, [fetchHoldings, fetchSummary, fetchSuggestions, fetchRiskAnalysis, fetchSectorAnalysis, fetchCorrelationAudit, activeTab]);

  useEffect(() => {
    if (summary?.stockReturns?.length > 0 && !selectedStockSymbol) {
      setSelectedStockSymbol(summary.stockReturns[0].symbol);
    }
  }, [summary, selectedStockSymbol]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.symbol || !form.quantity || !form.priceBoughtAt || !form.purchaseDate) {
      setError("Please fill all fields.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await axios.post(API, form, { headers });
      setSuccess(`Holding ${form.symbol.toUpperCase()} added successfully!`);
      setForm(EMPTY_FORM);
      fetchHoldings();
      // Clear cached data so other tabs refetch
      setSummary(null);
      setSuggestions(null);
      setRiskAnalysis(null);
      setSectorAnalysis(null);
      setCorrelationAudit(null);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || "Failed to add holding.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to remove this holding?")) return;
    try {
      await axios.delete(`${API}/${id}`, { headers });
      fetchHoldings();
      // Clear cached data so other tabs refetch
      setSummary(null);
      setSuggestions(null);
      setRiskAnalysis(null);
      setSectorAnalysis(null);
      setCorrelationAudit(null);
    } catch (err) {
      setError("Failed to delete holding.");
    }
  };

  const calculateTotalValue = () => holdings.reduce((sum, h) => sum + (h.quantity * (h.lastPrice || h.priceBoughtAt)), 0);
  const calculateTotalInvested = () => holdings.reduce((sum, h) => sum + (h.quantity * h.priceBoughtAt), 0);
  const totalValue = calculateTotalValue();
  const totalInvested = calculateTotalInvested();
  const totalPnL = totalValue - totalInvested;
  const totalReturnPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold">Portfolio Optimization</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage assets and optimize your risk-return profile.</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Total Value</p>
          <p className="text-2xl font-bold text-primary">{formatFullINR(totalValue)}</p>
        </div>
      </div>

      {/* Summary Mini Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Invested" value={formatINR(totalInvested)} color="blue" />
        <SummaryCard 
          label="Total P&L" 
          value={totalPnL >= 0 ? `+${formatINR(totalPnL)}` : formatINR(totalPnL)} 
          color={totalPnL >= 0 ? "emerald" : "red"} 
        />
        <SummaryCard 
          label="Return %" 
          value={`${totalReturnPct.toFixed(2)}%`} 
          color={totalReturnPct >= 0 ? "emerald" : "red"} 
        />
        {summary && <SummaryCard label="Portfolio β" value={summary.portfolioBeta?.toFixed(2) || "—"} color="violet" sub="Weighted beta" />}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border flex-wrap">
        {[
          { key: "holdings", label: "Holdings" },
          { key: "analytics", label: "Analytics" },
          { key: "comparison", label: "Compare" },
          { key: "suggestions", label: "Advice" },
          { key: "risk engine", label: "Risk" },
          { key: "smart insights", label: "Insights" },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>{tab.label}</button>
        ))}
      </div>

      {/* Tab: Holdings */}
      {activeTab === "holdings" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Holding Form */}
          <div className="lg:col-span-1">
            <div className="auth-card space-y-4">
              <h2 className="text-base font-semibold">Add New Holding</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stock Symbol</label>
                  <input 
                    type="text" 
                    placeholder="e.g. RELIANCE.NS, AAPL" 
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    value={form.symbol}
                    onChange={(e) => setForm({...form, symbol: e.target.value})}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1 italic">Note: Use .NS for NSE stocks (e.g. TCS.NS)</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quantity</label>
                    <input 
                      type="number" step="any"
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                      value={form.quantity}
                      onChange={(e) => setForm({...form, quantity: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Price Bought At (₹)</label>
                    <input 
                      type="number" step="any"
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                      value={form.priceBoughtAt}
                      onChange={(e) => setForm({...form, priceBoughtAt: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purchase Date</label>
                  <input 
                    type="date" 
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    value={form.purchaseDate}
                    onChange={(e) => setForm({...form, purchaseDate: e.target.value})}
                  />
                </div>
                
                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}
                
                <button 
                  type="submit" 
                  disabled={loading}
                  className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
                    loading ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"
                  }`}
                >
                  {loading ? "Fetching Data..." : "+ Add Holding"}
                </button>
              </form>
            </div>
          </div>

          {/* Holdings Table */}
          <div className="lg:col-span-2">
            <div className="auth-card overflow-x-auto">
              {holdings.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground italic">No holdings yet. Add your first stock to begin.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="pb-3 pr-3">Asset</th>
                      <th className="pb-3 pr-3">Category</th>
                      <th className="pb-3 pr-3 text-right">Quantity</th>
                      <th className="pb-3 pr-3 text-right">Price Bought</th>
                      <th className="pb-3 pr-3 text-right">Cur Price</th>
                      <th className="pb-3 pr-3 text-right">P&L</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {holdings.map((h) => {
                      const curValue = h.quantity * (h.lastPrice || 0);
                      const invested = h.quantity * h.priceBoughtAt;
                      const pnl = curValue - invested;
                      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
                      
                      return (
                        <tr key={h._id} className="hover:bg-secondary/20 transition-colors">
                          <td className="py-4 pr-3">
                            <div className="font-bold text-foreground">{h.symbol}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{h.companyName}</div>
                          </td>
                          <td className="py-4 pr-3">
                             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter"
                                style={{ backgroundColor: CAT_COLORS[h.category] + "20", color: CAT_COLORS[h.category] }}>
                                {h.category}
                              </span>
                          </td>
                          <td className="py-4 pr-3 text-right tabular-nums">{h.quantity}</td>
                          <td className="py-4 pr-3 text-right tabular-nums">{formatINR(h.priceBoughtAt)}</td>
                          <td className="py-4 pr-3 text-right tabular-nums">
                            {h.lastPrice ? h.lastPrice.toFixed(2) : <span className="text-xs italic text-muted-foreground">Stale</span>}
                          </td>
                          <td className={`py-4 pr-3 text-right tabular-nums font-semibold ${pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            <div>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}</div>
                            <div className="text-[10px] opacity-80">{pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</div>
                          </td>
                          <td className="py-4 text-right">
                            <button onClick={() => handleDelete(h._id)} className="text-red-400 hover:text-red-600 p-1">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Analytics */}
      {activeTab === "analytics" && summary && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Category Breakdown Donut */}
            <div className="auth-card">
              <h2 className="text-sm font-semibold mb-6 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                Asset Allocation by Category
              </h2>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.categoryBreakdown}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                    >
                      {summary.categoryBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={CAT_COLORS[entry.name] || "#ccc"} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(v) => formatFullINR(v)}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ paddingTop: '20px' }}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per-Stock Performance Bar */}
            <div className="auth-card">
              <h2 className="text-sm font-semibold mb-6 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                Returns by Stock (%)
              </h2>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.stockReturns} layout="vertical" margin={{ left: 30, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} strokeOpacity={0.1} />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="symbol" 
                      type="category" 
                      tick={{ fontSize: 10, fontWeight: 600 }}
                      width={70}
                    />
                    <Tooltip 
                      formatter={(v) => [`${v}%`, 'Return']}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar 
                      dataKey="returnPct" 
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                      isAnimationActive={false}
                      cursor="default"
                      activeBar={false}
                    >
                      {summary.stockReturns.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.returnPct >= 0 ? "#10b981" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Table Breakdown in Analytics */}
          <div className="auth-card">
            <h2 className="text-sm font-semibold mb-4">Stock Breakdown & Risk</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="pb-2">Stock</th>
                    <th className="pb-2">Return %</th>
                    <th className="pb-2">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.stockReturns.map((sr) => (
                      <tr key={sr.symbol} className="hover:bg-secondary/20">
                        <td className="py-2.5 font-bold">{sr.symbol}</td>
                        <td className={`py-2.5 ${sr.returnPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>{sr.returnPct}%</td>
                        <td className="py-2.5">{formatINR(sr.pnl)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="auth-card">
            <h2 className="text-sm font-semibold mb-4">Allocation Details</h2>
            <div className="space-y-4">
              {summary.categoryBreakdown.map((cat) => {
                const pct = summary.currentValue > 0 ? ((cat.total / summary.currentValue) * 100).toFixed(1) : 0;
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex justify-between text-sm items-center">
                      <span className="font-medium flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CAT_COLORS[cat.name] }}></span>
                        {cat.name}
                      </span>
                      <span className="text-muted-foreground font-mono">{formatFullINR(cat.total)} ({pct}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full transition-all duration-1000" 
                        style={{ width: `${pct}%`, backgroundColor: CAT_COLORS[cat.name] }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Suggestions / Advice */}
      {activeTab === "suggestions" && suggestions && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
           <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-2xl p-6">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl">&#128161;</div>
                 <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                       Investor Profile: 
                       <span className={`px-3 py-1 rounded-lg text-sm ${
                          suggestions.investorType === "Aggressive" ? "bg-red-100 text-red-700" :
                          suggestions.investorType === "Moderate" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                       }`}>
                          {suggestions.investorType}
                       </span>
                    </h2>
                    <p className="text-sm text-muted-foreground">Portfolio Value: <strong>{formatFullINR(suggestions.totalPortfolioValue)}</strong></p>
                 </div>
              </div>
           </div>

           {/* Allocation Table with Amounts */}
           <div className="auth-card">
              <h3 className="text-sm font-semibold mb-6">Allocation Analysis</h3>
              <div className="overflow-x-auto">
                 <table className="w-full text-sm">
                    <thead>
                       <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="pb-3 pr-4">Asset Class</th>
                          <th className="pb-3 pr-4 text-right">Current</th>
                          <th className="pb-3 pr-4 text-right">Target</th>
                          <th className="pb-3 pr-4 text-right">Delta</th>
                          <th className="pb-3 pr-4 text-right">Move Amount</th>
                          <th className="pb-3 text-right">Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                       {suggestions.analysis.map((item) => {
                          const statusColor = item.status === "Overweight" ? "text-red-500" : (item.status === "Underweight" ? "text-amber-500" : "text-emerald-500");
                          return (
                             <tr key={item.category} className="hover:bg-secondary/20 transition-colors">
                                <td className="py-4 pr-4 font-semibold">{item.category}</td>
                                <td className="py-4 pr-4 text-right tabular-nums">
                                   <div>{item.currentPct}%</div>
                                   <div className="text-[10px] text-muted-foreground">{formatINR(item.currentVal)}</div>
                                </td>
                                <td className="py-4 pr-4 text-right tabular-nums text-muted-foreground">
                                   <div>{item.targetPct}%</div>
                                   <div className="text-[10px]">{formatINR(item.targetVal)}</div>
                                </td>
                                <td className={`py-4 pr-4 text-right tabular-nums font-medium ${item.delta > 0 ? "text-red-400" : (item.delta < 0 ? "text-amber-400" : "")}`}>
                                   {item.delta > 0 ? "+" : ""}{item.delta}%
                                </td>
                                <td className={`py-4 pr-4 text-right tabular-nums font-semibold ${item.deltaAmount > 0 ? "text-red-500" : (item.deltaAmount < 0 ? "text-amber-500" : "text-emerald-500")}`}>
                                   {item.deltaAmount !== 0 ? (item.deltaAmount > 0 ? `Sell ${formatINR(Math.abs(item.deltaAmount))}` : `Buy ${formatINR(Math.abs(item.deltaAmount))}`) : "—"}
                                </td>
                                <td className={`py-4 text-right text-xs font-bold uppercase tracking-tight ${statusColor}`}>
                                   {item.status}
                                </td>
                             </tr>
                          );
                       })}
                    </tbody>
                 </table>
              </div>
           </div>

           {/* Rebalance Summary Flow */}
           {suggestions.summary && suggestions.rebalancePlan?.length > 0 && (
             <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
               <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2">Rebalance Flow</p>
               <p className="text-sm font-semibold text-foreground">{suggestions.summary}</p>
             </div>
           )}

           {/* Sell Actions — with per-stock recommendations */}
           {suggestions.sellActions?.length > 0 && (
             <div className="auth-card">
               <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/></svg>
                 Sell Recommendations (Lock in Gains)
               </h3>
               <div className="space-y-4">
                 {suggestions.sellActions.map((sa) => (
                   <div key={sa.category} className="space-y-3">
                     <div className="flex justify-between items-center">
                       <span className="font-bold text-red-700">{sa.category} <span className="text-xs font-normal text-red-400">(+{sa.excessPct}% overweight)</span></span>
                       <span className="text-sm font-bold text-red-600">Total: {formatINR(sa.totalSellAmount)}</span>
                     </div>
                     {sa.stocks.map((stock) => (
                       <div key={stock.symbol} className="flex flex-col md:flex-row md:items-center justify-between bg-red-50 rounded-xl px-4 py-3 border border-red-200 gap-2">
                         <div className="flex items-center gap-3">
                           <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center text-red-600 font-bold text-xs">&#8722;</div>
                           <div>
                             <p className="font-bold text-red-800 text-sm">{stock.symbol} <span className="text-xs font-normal text-red-400">{stock.companyName}</span></p>
                             <p className="text-[11px] text-red-500">{stock.reason}</p>
                           </div>
                         </div>
                         <div className="text-right">
                           <p className="font-bold text-red-700">Sell {stock.sellQuantity} shares</p>
                           <p className="text-xs text-red-500">&#8776; {formatINR(stock.sellAmount)} | Return: <span className={stock.currentReturn >= 0 ? "text-emerald-600" : "text-red-600"}>{stock.currentReturn >= 0 ? "+" : ""}{stock.currentReturn}%</span></p>
                         </div>
                       </div>
                     ))}
                   </div>
                 ))}
               </div>
             </div>
           )}

           {/* Buy Actions */}
           {suggestions.buyActions?.length > 0 && (
             <div className="auth-card">
               <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>
                 Buy Recommendations (Fill Gaps)
               </h3>
               <div className="space-y-3">
                 {suggestions.buyActions.map((ba) => (
                   <div key={ba.category} className="flex flex-col md:flex-row md:items-center justify-between bg-emerald-50 rounded-xl px-5 py-4 border border-emerald-200 gap-3">
                     <div className="flex items-center gap-3">
                       <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">+</div>
                       <div>
                         <p className="font-bold text-emerald-800">{ba.category}</p>
                         <p className="text-[11px] text-emerald-600">{ba.suggestion}</p>
                       </div>
                     </div>
                     <div className="text-right">
                       <p className="text-lg font-bold text-emerald-700">{formatINR(ba.totalBuyAmount)}</p>
                       <p className="text-xs text-emerald-500">Deficit: {ba.deficitPct.toFixed(1)}%</p>
                     </div>
                   </div>
                 ))}
               </div>
             </div>
           )}

           {/* All balanced */}
           {suggestions.analysis.every(item => item.status === "On Track") && (
             <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
               <div className="text-4xl mb-3">&#9989;</div>
               <h3 className="text-lg font-bold text-emerald-800">Portfolio is Perfectly Balanced</h3>
               <p className="text-sm text-emerald-600 mt-1">All allocations are within target range for your <strong>{suggestions.investorType}</strong> profile. No rebalancing needed!</p>
             </div>
           )}
        </div>
      )}

      {/* Tab: Comparison */}
      {activeTab === "comparison" && summary && (
        <div className="space-y-8 animate-in zoom-in-95 duration-300">
           <div className="auth-card">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                 <div>
                    <h2 className="text-lg font-bold">Stock vs. Portfolio</h2>
                    <p className="text-sm text-muted-foreground">Detailed metric comparison for a specific holding.</p>
                 </div>
                 <div className="min-w-[200px]">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Select Asset</label>
                    <select 
                       className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                       value={selectedStockSymbol}
                       onChange={(e) => setSelectedStockSymbol(e.target.value)}
                    >
                       {summary.stockReturns.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
                    </select>
                 </div>
              </div>

              {summary.stockReturns.find(s => s.symbol === selectedStockSymbol) ? (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <ComparisonMetric 
                       label="Total Return %" 
                       stockValue={`${summary.stockReturns.find(s => s.symbol === selectedStockSymbol).returnPct}%`}
                       portfolioValue={`${summary.totalReturnPct}%`}
                       isHigherBetter={true}
                    />

                    <ComparisonMetric 
                       label="Asset Weight %" 
                       stockValue={`${((summary.stockReturns.find(s => s.symbol === selectedStockSymbol).value / summary.currentValue) * 100).toFixed(2)}%`}
                       portfolioValue="Average"
                       subText="Contribution to total value."
                    />
                 </div>
              ) : (
                 <p className="text-center py-10 text-muted-foreground italic">Select a stock to see comparison data.</p>
              )}
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="auth-card">
                 <h3 className="text-sm font-semibold mb-4">Performance Insight</h3>
                 <p className="text-sm text-muted-foreground leading-relaxed">
                    {(() => {
                       const stock = summary.stockReturns.find(s => s.symbol === selectedStockSymbol);
                       if (!stock) return "";
                       const isOutperforming = stock.returnPct > summary.totalReturnPct;
                       return `The holding ${stock.symbol} is currently ${isOutperforming ? "outperforming" : "underperforming"} your overall portfolio return by ${Math.abs(stock.returnPct - summary.totalReturnPct).toFixed(2)}%.`;
                    })()}
                 </p>
              </div>
           </div>
        </div>
      )}

      {/* Tab: Risk Engine */}
      {activeTab === "risk engine" && riskAnalysis && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Risk Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`rounded-2xl border p-5 transition-all hover:shadow-md ${
              riskAnalysis.portfolioWeightedBeta <= 0.8 ? "bg-emerald-50 border-emerald-200" :
              riskAnalysis.portfolioWeightedBeta <= 1.2 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
            }`}>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Portfolio Beta (β)</p>
              <p className={`text-3xl font-bold ${
                riskAnalysis.portfolioWeightedBeta <= 0.8 ? "text-emerald-700" :
                riskAnalysis.portfolioWeightedBeta <= 1.2 ? "text-amber-700" : "text-red-700"
              }`}>{riskAnalysis.portfolioWeightedBeta}</p>
              <p className="text-[10px] mt-1 opacity-60 font-medium">Target: {riskAnalysis.targetBetaRange.min} – {riskAnalysis.targetBetaRange.max}</p>
            </div>
            <div className="rounded-2xl border p-5 bg-blue-50 border-blue-200 transition-all hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1 text-blue-700">Portfolio Volatility</p>
              <p className="text-3xl font-bold text-blue-700">{riskAnalysis.portfolioVolatility}%</p>
              <p className="text-[10px] mt-1 opacity-60 font-medium text-blue-600">Annualized weighted average</p>
            </div>
            <div className={`rounded-2xl border p-5 transition-all hover:shadow-md ${
              riskAnalysis.riskRating === "Low" ? "bg-emerald-50 border-emerald-200" :
              riskAnalysis.riskRating === "Moderate" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
            }`}>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Risk Rating</p>
              <p className={`text-3xl font-bold ${
                riskAnalysis.riskRating === "Low" ? "text-emerald-700" :
                riskAnalysis.riskRating === "Moderate" ? "text-amber-700" : "text-red-700"
              }`}>{riskAnalysis.riskRating}</p>
              <p className="text-[10px] mt-1 opacity-60 font-medium">Profile: {riskAnalysis.investorType}</p>
            </div>
          </div>

          {/* High-Risk Inconsistencies Alert */}
          {riskAnalysis.inconsistencies.length > 0 && (
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl">⚠️</div>
                <div>
                  <h3 className="text-base font-bold text-red-800">
                    {riskAnalysis.inconsistencies.length} High-Risk Inconsistenc{riskAnalysis.inconsistencies.length === 1 ? "y" : "ies"} Detected
                  </h3>
                  <p className="text-xs text-red-600">These holdings conflict with your <strong>{riskAnalysis.investorType}</strong> risk profile.</p>
                </div>
              </div>
              <div className="space-y-3">
                {riskAnalysis.inconsistencies.map((item) => (
                  <div key={item.symbol} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-red-200">
                    <div>
                      <span className="font-bold text-red-800">{item.symbol}</span>
                      <span className="text-xs text-red-500 ml-2">{item.companyName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-red-700">β = {item.beta}</span>
                      <p className="text-[10px] text-red-500">{item.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Holdings Risk Table */}
          <div className="auth-card">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Holdings Risk Analysis
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="pb-3 pr-3">Stock</th>
                    <th className="pb-3 pr-3 text-right">Beta (β)</th>
                    <th className="pb-3 pr-3 text-right">Volatility</th>
                    <th className="pb-3 pr-3 text-right">Weight</th>
                    <th className="pb-3 pr-3 text-right">Value</th>
                    <th className="pb-3 text-center">Risk Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {riskAnalysis.holdings.sort((a, b) => b.beta - a.beta).map((h) => (
                    <tr key={h.symbol} className={`transition-colors ${h.flagged ? "bg-red-50 hover:bg-red-100" : "hover:bg-secondary/20"}`}>
                      <td className="py-3 pr-3">
                        <div className="font-bold">{h.symbol}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{h.companyName}</div>
                      </td>
                      <td className={`py-3 pr-3 text-right tabular-nums font-semibold ${
                        h.beta <= 0.8 ? "text-emerald-600" : h.beta <= 1.2 ? "text-amber-600" : "text-red-600"
                      }`}>{h.beta}</td>
                      <td className="py-3 pr-3 text-right tabular-nums">{h.volatility}%</td>
                      <td className="py-3 pr-3 text-right tabular-nums">{h.weight}%</td>
                      <td className="py-3 pr-3 text-right tabular-nums">{formatINR(h.value)}</td>
                      <td className="py-3 text-center">
                        {h.flagged ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700">⚠ HIGH</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">✓ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rebalancing Recommendations */}
          {riskAnalysis.rebalanceSuggestions.length > 0 && (
            <div className="auth-card">
              <h2 className="text-sm font-semibold mb-6 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>
                Rebalancing Recommendations
              </h2>

              {/* Trim Suggestions */}
              <div className="space-y-3 mb-6">
                <p className="text-xs font-bold text-red-600 uppercase tracking-wide">📉 Reduce Exposure</p>
                {riskAnalysis.rebalanceSuggestions.filter(s => s.action === "TRIM").map((s, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between bg-red-50 rounded-xl px-5 py-4 border border-red-200 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm">−</div>
                      <div>
                        <p className="font-bold text-red-800">{s.symbol} <span className="text-xs font-normal text-red-500">({s.companyName})</span></p>
                        <p className="text-[11px] text-red-500">{s.reason}</p>
                      </div>
                    </div>
                    <div className="text-right md:text-right">
                      <p className="text-lg font-bold text-red-700">Trim {s.trimPct}%</p>
                      <p className="text-xs text-red-500">≈ {formatINR(s.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Allocation Suggestions */}
              <div className="space-y-3 mb-6">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">📈 Reallocate To</p>
                {riskAnalysis.rebalanceSuggestions.filter(s => s.action === "ALLOCATE").map((s, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between bg-emerald-50 rounded-xl px-5 py-4 border border-emerald-200 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm">+</div>
                      <div>
                        <p className="font-bold text-emerald-800">{s.target}</p>
                        <p className="text-[11px] text-emerald-600">{s.reason}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-emerald-700">{formatINR(s.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Before / After Beta Comparison */}
              <div className="bg-secondary/30 rounded-2xl p-6 border border-border">
                <h4 className="font-bold mb-4 text-sm">Projected Impact</h4>
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">Current Beta</p>
                    <p className={`text-2xl font-bold ${
                      riskAnalysis.portfolioWeightedBeta > riskAnalysis.targetBetaRange.max ? "text-red-600" : "text-emerald-600"
                    }`}>{riskAnalysis.portfolioWeightedBeta}</p>
                    <div className="mt-2 w-full h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (riskAnalysis.portfolioWeightedBeta / 2) * 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">After Rebalance</p>
                    <p className={`text-2xl font-bold ${
                      riskAnalysis.projectedBetaAfterRebalance <= riskAnalysis.targetBetaRange.max ? "text-emerald-600" : "text-amber-600"
                    }`}>{riskAnalysis.projectedBetaAfterRebalance}</p>
                    <div className="mt-2 w-full h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (riskAnalysis.projectedBetaAfterRebalance / 2) * 100)}%` }}></div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground mt-4">
                  Target range: <strong>{riskAnalysis.targetBetaRange.min} – {riskAnalysis.targetBetaRange.max}</strong> for {riskAnalysis.investorType} profile
                </p>
              </div>
            </div>
          )}

          {/* All clear message when no inconsistencies */}
          {riskAnalysis.inconsistencies.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-lg font-bold text-emerald-800">Portfolio Risk is Well-Aligned</h3>
              <p className="text-sm text-emerald-600 mt-1">All holdings are consistent with your <strong>{riskAnalysis.investorType}</strong> risk profile. No rebalancing needed.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Smart Insights — Sector Exposure Analysis */}
      {activeTab === "smart insights" && sectorAnalysis && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Diversification Score + Top Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`rounded-2xl border p-5 transition-all hover:shadow-md ${
              sectorAnalysis.diversificationScore >= 70 ? "bg-emerald-50 border-emerald-200" :
              sectorAnalysis.diversificationScore >= 40 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
            }`}>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Diversification Score</p>
              <p className={`text-3xl font-bold ${
                sectorAnalysis.diversificationScore >= 70 ? "text-emerald-700" :
                sectorAnalysis.diversificationScore >= 40 ? "text-amber-700" : "text-red-700"
              }`}>{sectorAnalysis.diversificationScore}/100</p>
              <p className="text-[10px] mt-1 opacity-60 font-medium">
                {sectorAnalysis.diversificationScore >= 70 ? "Well diversified" :
                 sectorAnalysis.diversificationScore >= 40 ? "Moderately diversified" : "Poorly diversified"}
              </p>
            </div>
            <div className="rounded-2xl border p-5 bg-blue-50 border-blue-200 transition-all hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1 text-blue-700">Sectors Covered</p>
              <p className="text-3xl font-bold text-blue-700">{sectorAnalysis.sectorBreakdown.length}</p>
              <p className="text-[10px] mt-1 opacity-60 font-medium text-blue-600">out of 11 major sectors</p>
            </div>
            <div className={`rounded-2xl border p-5 transition-all hover:shadow-md ${
              sectorAnalysis.concentrationWarnings.length === 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
            }`}>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Concentration Alerts</p>
              <p className={`text-3xl font-bold ${
                sectorAnalysis.concentrationWarnings.length === 0 ? "text-emerald-700" : "text-red-700"
              }`}>{sectorAnalysis.concentrationWarnings.length}</p>
              <p className="text-[10px] mt-1 opacity-60 font-medium">{sectorAnalysis.concentrationWarnings.length === 0 ? "No sector > 30%" : "Sectors exceeding 30%"}</p>
            </div>
          </div>

          {/* Concentration Warnings */}
          {sectorAnalysis.concentrationWarnings.length > 0 && (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xl">&#9888;&#65039;</div>
                <div>
                  <h3 className="text-base font-bold text-amber-800">Concentration Warning</h3>
                  <p className="text-xs text-amber-600">One or more sectors exceed the 30% concentration threshold.</p>
                </div>
              </div>
              <div className="space-y-3">
                {sectorAnalysis.concentrationWarnings.map((w) => (
                  <div key={w.sector} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-200">
                    <div>
                      <span className="font-bold text-amber-800">{w.sector}</span>
                      <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${
                        w.severity === "Critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>{w.severity}</span>
                    </div>
                    <span className="text-lg font-bold text-amber-700">{w.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top 3 Sector Exposure */}
          <div className="auth-card">
            <h2 className="text-sm font-semibold mb-6 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
              Sector Exposure Breakdown
            </h2>
            <div className="space-y-4">
              {sectorAnalysis.sectorBreakdown.map((s, idx) => {
                const barColors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#6366f1", "#ef4444", "#14b8a6", "#f97316", "#06b6d4", "#84cc16"];
                const color = barColors[idx % barColors.length];
                const isOverweight = s.percentage > 30;
                return (
                  <div key={s.sector} className={`rounded-xl p-4 border ${isOverweight ? "border-amber-300 bg-amber-50" : "border-border"}`}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
                        <span className="font-semibold text-sm">{s.sector}</span>
                        {isOverweight && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">Over 30%</span>}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-sm">{s.percentage}%</span>
                        <span className="text-xs text-muted-foreground ml-2">{formatINR(s.value)}</span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${s.percentage}%`, backgroundColor: color }}></div>
                    </div>
                    {/* Stocks in this sector */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {s.holdings.map(h => (
                        <span key={h.symbol} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary font-medium">{h.symbol} ({h.weight}%)</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Diversification Suggestion */}
          {sectorAnalysis.diversificationSuggestion && (
            <div className="auth-card">
              <h2 className="text-sm font-semibold mb-6 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>
                Actionable Insight
              </h2>
              <div className="space-y-4">
                {/* Shift suggestion */}
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 bg-red-50 rounded-xl p-5 border border-red-200">
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">Reduce</p>
                    <p className="text-lg font-bold text-red-800">{sectorAnalysis.diversificationSuggestion.fromSector}</p>
                    <p className="text-sm text-red-600 mt-1">Shift ~{sectorAnalysis.diversificationSuggestion.shiftPercentage}% ({formatINR(sectorAnalysis.diversificationSuggestion.shiftAmount)})</p>
                  </div>
                  <div className="flex items-center justify-center text-2xl text-muted-foreground">&#8594;</div>
                  <div className="flex-1 bg-emerald-50 rounded-xl p-5 border border-emerald-200">
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">Add Exposure</p>
                    <p className="text-lg font-bold text-emerald-800">{sectorAnalysis.diversificationSuggestion.toSector}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {sectorAnalysis.diversificationSuggestion.exampleStocks.map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-secondary/30 rounded-xl p-4 border border-border">
                  <p className="text-sm text-muted-foreground">{sectorAnalysis.diversificationSuggestion.reason}</p>
                </div>
              </div>
            </div>
          )}

          {/* Missing Sectors */}
          {sectorAnalysis.missingSectors.length > 0 && (
            <div className="auth-card">
              <h2 className="text-sm font-semibold mb-4">Missing Sector Exposure</h2>
              <p className="text-xs text-muted-foreground mb-4">You have no holdings in these sectors. Consider adding exposure for better diversification:</p>
              <div className="flex flex-wrap gap-2">
                {sectorAnalysis.missingSectors.map(s => (
                  <span key={s} className="px-3 py-1.5 rounded-full border border-dashed border-muted-foreground/30 text-xs font-medium text-muted-foreground">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* All clear */}
          {sectorAnalysis.concentrationWarnings.length === 0 && sectorAnalysis.sectorBreakdown.length > 3 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">&#9989;</div>
              <h3 className="text-lg font-bold text-emerald-800">Healthy Sector Diversification</h3>
              <p className="text-sm text-emerald-600 mt-1">No sector exceeds 30% — your portfolio has balanced sector exposure.</p>
            </div>
          )}

          {/* Correlation Audit — Industry Cluster Analysis */}
          {correlationAudit && correlationAudit.redundancies?.length > 0 && (
            <div className="space-y-6">
              <div className="auth-card">
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  Correlation Audit — Industry Clusters
                </h2>
                <p className="text-xs text-muted-foreground mb-6">Stocks in the same sub-industry are highly correlated. Multiple positions amplify risk without adding diversification.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                  <div className="rounded-xl border p-4 bg-violet-50 border-violet-200">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-600 mb-1">Industry Clusters</p>
                    <p className="text-2xl font-bold text-violet-700">{correlationAudit.clusterCount}</p>
                  </div>
                  <div className="rounded-xl border p-4 bg-amber-50 border-amber-200">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 mb-1">Redundant Value</p>
                    <p className="text-2xl font-bold text-amber-700">{formatINR(correlationAudit.totalRedundantValue)}</p>
                  </div>
                  <div className="rounded-xl border p-4 bg-blue-50 border-blue-200">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600 mb-1">Unique Industries</p>
                    <p className="text-2xl font-bold text-blue-700">{correlationAudit.totalIndustries}</p>
                  </div>
                </div>
                {correlationAudit.redundancies.map((r) => (
                  <div key={r.industry} className="rounded-2xl border-2 border-violet-200 bg-violet-50/30 p-5 mb-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-violet-900">{r.industry}</h3>
                        <p className="text-xs text-violet-500">{r.sector}</p>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded-full bg-violet-200 text-violet-800">Cluster</span>
                    </div>
                    <div className="bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-200 mb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800">LEADER</span>
                          <span className="font-bold text-sm">{r.leader.symbol}</span>
                          <span className="text-xs text-muted-foreground">{r.leader.companyName}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-sm">{formatINR(r.leader.value)}</span>
                          <span className={`ml-2 text-xs font-bold ${r.leader.returnPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>{r.leader.returnPct >= 0 ? "+" : ""}{r.leader.returnPct}%</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-emerald-600 mt-1">{r.leader.reason}</p>
                    </div>
                    {r.redundantStocks.map((s) => (
                      <div key={s.symbol} className="bg-red-50 rounded-xl px-4 py-3 border border-red-200 mb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-200 text-red-800">REDUNDANT</span>
                            <span className="font-bold text-sm">{s.symbol}</span>
                            <span className="text-xs text-muted-foreground">{s.companyName}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold text-sm">{formatINR(s.value)}</span>
                            <span className={`ml-2 text-xs font-bold ${s.returnPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>{s.returnPct >= 0 ? "+" : ""}{s.returnPct}%</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-red-500 mt-1">{s.action}</p>
                      </div>
                    ))}
                    <div className="bg-secondary/40 rounded-xl p-4 mt-3 border border-border">
                      <p className="text-xs text-foreground mb-2">{r.consolidationAdvice}</p>
                      <p className="text-[10px] text-muted-foreground italic">{r.riskExplanation}</p>
                    </div>
                  </div>
                ))}
              </div>
              {correlationAudit.totalRedundantValue > 0 && (
                <div className="auth-card">
                  <h2 className="text-sm font-semibold mb-2">Suggested Uncorrelated Alternatives</h2>
                  <p className="text-xs text-muted-foreground mb-4">Redirect redundant capital ({formatINR(correlationAudit.totalRedundantValue)}) into these low-correlation asset classes:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {correlationAudit.suggestions.map((s) => (
                      <div key={s.name} className="rounded-xl border p-4 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-bold text-sm">{s.name}</p>
                          {s.allocateAmount > 0 && <span className="text-xs font-bold text-primary">{formatINR(s.allocateAmount)}</span>}
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-2">{s.reason}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {s.examples.map(ex => (
                            <span key={ex} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary font-medium">{ex}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab Skeletons for Other Phases */}
      {((activeTab === "analytics" && !summary) || (activeTab === "comparison" && !summary) || (activeTab === "suggestions" && !suggestions) || (activeTab === "risk engine" && !riskAnalysis) || (activeTab === "smart insights" && !sectorAnalysis)) && (
        <div className="auth-card p-12 text-center">
           <h2 className="text-xl font-bold mb-2 capitalize">{activeTab} Loading</h2>
           <p className="text-muted-foreground">Fetching live data and calculating portfolio metrics...</p>
           <div className="mt-8 flex justify-center gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
           </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, sub }) {
  const colors = {
    red: "bg-red-50 border-red-200 text-red-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
  };
  return (
    <div className={`rounded-2xl border p-4 transition-all hover:shadow-md ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-[10px] mt-1 opacity-60 font-medium">{sub}</p>}
    </div>
  );
}

function ComparisonMetric({ label, stockValue, portfolioValue, isHigherBetter, subText }) {
   const stockNum = parseFloat(stockValue);
   const portNum = parseFloat(portfolioValue);
   const isDiff = !isNaN(stockNum) && !isNaN(portNum);
   
   let colorClass = "text-foreground";
   if (isDiff && isHigherBetter !== undefined) {
      if (isHigherBetter) {
         colorClass = stockNum >= portNum ? "text-emerald-600" : "text-red-500";
      } else {
         colorClass = stockNum <= portNum ? "text-emerald-600" : "text-red-500";
      }
   }

   return (
      <div className="bg-secondary/20 rounded-2xl p-6 border border-border/50">
         <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-4">{label}</p>
         <div className="space-y-4">
            <div>
               <p className={`text-2xl font-bold ${colorClass}`}>{stockValue}</p>
               <p className="text-[10px] text-muted-foreground uppercase font-medium">Selected Asset</p>
            </div>
            <div className="pt-4 border-t border-border/50">
               <p className="text-lg font-bold text-muted-foreground">{portfolioValue}</p>
               <p className="text-[10px] text-muted-foreground uppercase font-medium">Portfolio Avg</p>
            </div>
            {subText && <p className="text-[10px] italic text-muted-foreground/60">{subText}</p>}
         </div>
      </div>
   );
}
