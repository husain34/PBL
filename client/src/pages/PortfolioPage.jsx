import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";

const API = "http://localhost:5000/api/portfolio";

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

  useEffect(() => {
    fetchHoldings();
    if (activeTab === "analytics" || activeTab === "comparison" || activeTab === "suggestions") {
       fetchSummary();
    }
    if (activeTab === "suggestions") {
       fetchSuggestions();
    }
  }, [fetchHoldings, fetchSummary, fetchSuggestions, activeTab]);

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
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add holding.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to remove this holding?")) return;
    try {
      await axios.delete(`${API}/${id}`, { headers });
      fetchHoldings();
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

      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {["holdings", "analytics", "comparison", "suggestions"].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium capitalize transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>{tab}</button>
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

      {/* Tab: Suggestions */}
      {activeTab === "suggestions" && suggestions && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
           <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-2xl p-6">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl">💡</div>
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
                    <p className="text-sm text-muted-foreground">Target allocations adjusted for your risk appetite.</p>
                 </div>
              </div>
           </div>

           <div className="auth-card">
              <h3 className="text-sm font-semibold mb-6">Allocation Analysis & Suggestions</h3>
              <div className="overflow-x-auto">
                 <table className="w-full text-sm">
                    <thead>
                       <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="pb-3 pr-4">Asset Class</th>
                          <th className="pb-3 pr-4 text-right">Current %</th>
                          <th className="pb-3 pr-4 text-right">Target %</th>
                          <th className="pb-3 pr-4 text-right">Delta</th>
                          <th className="pb-3 text-right">Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                       {suggestions.analysis.map((item) => {
                          const statusColor = item.status === "Overweight" ? "text-red-500" : (item.status === "Underweight" ? "text-amber-500" : "text-emerald-500");
                          return (
                             <tr key={item.category} className="hover:bg-secondary/20 transition-colors">
                                <td className="py-4 pr-4 font-semibold">{item.category}</td>
                                <td className="py-4 pr-4 text-right tabular-nums">{item.currentPct}%</td>
                                <td className="py-4 pr-4 text-right tabular-nums text-muted-foreground">{item.targetPct}%</td>
                                <td className={`py-4 pr-4 text-right tabular-nums font-medium ${item.delta > 0 ? "text-red-400" : (item.delta < 0 ? "text-amber-400" : "")}`}>
                                   {item.delta > 0 ? "+" : ""}{item.delta}%
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

           <div className="bg-secondary/30 rounded-2xl p-6 border border-border">
              <h4 className="font-bold mb-3 flex items-center gap-2">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>
                 Rebalancing Advice
              </h4>
              <ul className="space-y-3">
                 {suggestions.analysis.filter(item => item.status !== "On Track").map((item, idx) => (
                    <li key={idx} className="text-sm flex gap-3 text-muted-foreground">
                       <span className="text-primary font-bold">•</span>
                       <span>
                          You are <strong>{item.status.toLowerCase()}</strong> in {item.category} 
                          ({item.currentPct}% actual vs {item.targetPct}% target). 
                          {item.status === "Overweight" ? " Consider selling some holdings to lower risk." : " Consider increasing exposure to this asset class."}
                       </span>
                    </li>
                 ))}
                 {suggestions.analysis.every(item => item.status === "On Track") && (
                    <li className="text-sm text-emerald-600 font-medium">✨ Your portfolio is perfectly balanced for a {suggestions.investorType} profile!</li>
                 )}
              </ul>
           </div>
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

      {/* Tab Skeletons for Other Phases */}
      {((activeTab === "analytics" && !summary) || (activeTab === "comparison" && !summary) || (activeTab === "suggestions" && !suggestions)) && (
        <div className="auth-card p-12 text-center">
           <h2 className="text-xl font-bold mb-2 capitalize">{activeTab} Phase Loading</h2>
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
