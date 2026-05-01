import React, { useState, useEffect, useCallback } from "react";
import axios from "../api/axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from "recharts";

const API = "";

function formatFullINR(v) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
}
function formatINR(v) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v}`;
}
function formatMonthKey(key) {
  const [y, m] = key.split("-");
  return new Date(y, m - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="600">{`${(percent * 100).toFixed(0)}%`}</text>;
};

const PAYMENT_MODES = ["Cash", "UPI", "Card", "Net Banking", "Other"];
const EMPTY_FORM = { amount: "", categoryId: "", date: new Date().toISOString().split("T")[0], note: "", paymentMode: "UPI", isRecurring: false, recurringMonthsLeft: "" };
const EMPTY_CAT_FORM = { name: "", color: "#6b7280", type: "want" };
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => currentYear - i);

export default function ExpensePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [catForm, setCatForm] = useState(EMPTY_CAT_FORM);
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [filterMode, setFilterMode] = useState("month"); // "month" | "year"
  const [selectedMonth, setSelectedMonth] = useState(`${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [showCatForm, setShowCatForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("add");
  const [recurringNotice, setRecurringNotice] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [activeCategory, setActiveCategory] = useState(null);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchAll = useCallback(async () => {
    try {
      const query = filterMode === "year" ? `year=${selectedYear}` : `month=${selectedMonth}`;
      const [catRes, expRes, analyticsRes] = await Promise.all([
        axios.get(`${API}/categories`, { headers }),
        axios.get(`${API}/expenses?${query}`, { headers }),
        axios.get(`${API}/expenses/analytics`, { headers }),
      ]);
      setCategories(catRes.data);
      setExpenses(expRes.data);
      setAnalytics(analyticsRes.data);
      if (catRes.data.length > 0 && !form.categoryId)
        setForm((f) => ({ ...f, categoryId: catRes.data[0]._id }));
    } catch { setError("Failed to load data."); }
  }, [selectedMonth, selectedYear, filterMode]);

  useEffect(() => {
    axios.post(`${API}/expenses/apply-recurring`, {}, { headers })
      .then((res) => { if (res.data.applied > 0) setRecurringNotice(`${res.data.applied} recurring expense(s) auto-added for this month.`); })
      .catch(() => {});
  }, []);

  useEffect(() => { 
    fetchAll();
    const handleFocus = () => fetchAll();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchAll]);

  const handleSubmit = async () => {
    if (!form.amount || !form.categoryId || !form.date) { setError("Please fill in amount, category and date."); return; }
    if (analytics && Number(form.amount) > analytics.totalBalance) {
      setError(`Amount exceeds your total balance of ${formatFullINR(analytics.totalBalance)}.`); return;
    }
    setSubmitting(true); setError(""); setSuccess("");
    try {
      const payload = { ...form, amount: Number(form.amount), recurringMonthsLeft: form.isRecurring ? (Number(form.recurringMonthsLeft) || 0) : 0 };
      await axios.post(`${API}/expenses`, payload, { headers });
      setSuccess("Expense added!");
      setForm({ ...EMPTY_FORM, categoryId: form.categoryId });
      await fetchAll();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed to add expense."); }
    finally { setSubmitting(false); }
  };

  const handleEdit = (exp) => {
    setEditingId(exp._id);
    setEditForm({
      amount: exp.amount, categoryId: exp.categoryId?._id || exp.categoryId,
      paymentMode: exp.paymentMode, note: exp.note || "",
      isRecurring: exp.isRecurring, recurringMonthsLeft: exp.recurringMonthsLeft || "",
    });
  };

  const handleEditSave = async (id) => {
    try {
      await axios.put(`${API}/expenses/${id}`, { ...editForm, amount: Number(editForm.amount) }, { headers });
      setEditingId(null);
      await fetchAll();
    } catch (err) { setError(err.response?.data?.message || "Failed to update."); }
  };

  const handleDeleteExpense = async (id) => {
    try { await axios.delete(`${API}/expenses/${id}`, { headers }); await fetchAll(); }
    catch { setError("Failed to delete."); }
  };

  const handleAddCategory = async () => {
    if (!catForm.name) { setError("Category name is required."); return; }
    try {
      await axios.post(`${API}/categories`, catForm, { headers });
      setCatForm(EMPTY_CAT_FORM); setShowCatForm(false); await fetchAll();
    } catch (err) { setError(err.response?.data?.message || "Failed."); }
  };

  const handleDeleteCategory = async (id) => {
    try { await axios.delete(`${API}/categories/${id}`, { headers }); await fetchAll(); }
    catch { setError("Cannot delete default category."); }
  };

  const monthChange = analytics ? analytics.thisTotal - analytics.prevTotal : 0;
  const monthChangePercent = analytics?.prevTotal ? ((monthChange / analytics.prevTotal) * 100).toFixed(1) : null;
  const safeToSpend = analytics ? Math.max(0, analytics.totalBalance - analytics.thisTotal) : 0;
  const activeCategoryIndex = analytics?.categoryBreakdown?.findIndex((cat) => cat.name === activeCategory) ?? -1;

  return (
    <div className="dashboard-shell space-y-8">
      <section className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">Spending Center</p>
          <h1 className="dashboard-title dashboard-page-title">Expense Tracker</h1>
          <p className="dashboard-subtitle">
            Track where money goes, monitor category patterns, and keep your spend control tools in one cleaner workspace.
          </p>
        </div>
      </section>

      {recurringNotice && (
        <div className="dashboard-soft-banner dashboard-soft-banner-blue flex items-center justify-between">
          <span>{recurringNotice}</span>
          <button onClick={() => setRecurringNotice("")} className="text-blue-400 hover:text-blue-600 ml-4">×</button>
        </div>
      )}

      {analytics && (
        <div className="dashboard-stat-grid">
          <SummaryCard label="This Month" value={formatFullINR(analytics.thisTotal)} color="red" />
          <SummaryCard label="vs Last Month"
            value={monthChange >= 0 ? `+${formatFullINR(monthChange)}` : formatFullINR(monthChange)}
            sub={monthChangePercent ? `${monthChangePercent}% change` : null}
            color={monthChange <= 0 ? "emerald" : "red"} />
          <SummaryCard label="Savings This Month" value={formatFullINR(analytics.netSavings)}
            sub="Income minus expenses" color={analytics.netSavings >= 0 ? "emerald" : "red"} />
          <SummaryCard label="Overall Savings" value={formatFullINR(analytics.overallSavings)}
            sub="All-time" color={analytics.overallSavings >= 0 ? "emerald" : "red"} />
        </div>
      )}

      {analytics && (
        <div className="dashboard-balance-card">
          <div>
            <p className="dashboard-balance-label">Total Balance</p>
            <p className="dashboard-balance-value">{formatFullINR(analytics.totalBalance)}</p>
            <p className="dashboard-balance-copy">This is the maximum available amount your expense entries can use.</p>
          </div>
          <div className="dashboard-balance-meta">
            <div className="dashboard-balance-chip">
              <span>Safe to Spend</span>
              <strong>{formatFullINR(safeToSpend)}</strong>
            </div>
            <div className="dashboard-balance-chip dashboard-balance-chip-muted">
              <span>This Month</span>
              <strong>{formatFullINR(analytics.thisTotal)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="dashboard-tabbar">
        {["add", "analytics", "forecast", "records", "categories"].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`dashboard-tab ${activeTab === tab ? "dashboard-tab-active" : ""}`}>{tab}</button>
        ))}
      </div>

      {/* Tab: Add */}
      {activeTab === "add" && (
        <div className="dashboard-tab-panel grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="panel-card space-y-4">
            <h2 className="text-base font-semibold">Add Expense</h2>
            <div className="space-y-1">
              <label className="dashboard-field-label">Amount (INR)</label>
              <input type="number" min="0"
                className="dashboard-input"
                placeholder="e.g. 500" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              {analytics && form.amount && Number(form.amount) > analytics.totalBalance && (
                <p className="text-xs text-red-500 mt-1">Exceeds total balance ({formatFullINR(analytics.totalBalance)})</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="dashboard-field-label">Category</label>
              <select className="dashboard-input"
                value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                {categories.map((c) => <option key={c._id} value={c._id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="dashboard-field-label">Payment Mode</label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_MODES.map((m) => (
                  <button key={m} onClick={() => setForm({ ...form, paymentMode: m })}
                    className={`dashboard-toggle-button ${form.paymentMode === m ? "dashboard-toggle-button-active" : ""}`}>{m}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="dashboard-field-label">Date</label>
              <input type="date"
                className="dashboard-input"
                value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="dashboard-field-label">Note (optional)</label>
              <input type="text"
                className="dashboard-input"
                placeholder="e.g. Lunch with team" value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={form.isRecurring}
                  onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })} className="rounded" />
                <span className="text-muted-foreground">Mark as recurring</span>
              </label>
              {form.isRecurring && (
                <div className="space-y-1 pl-6">
                  <label className="dashboard-field-label">Repeat for how many months?</label>
                  <input type="number" min="1"
                    className="dashboard-input"
                    placeholder="Leave blank for indefinite" value={form.recurringMonthsLeft}
                    onChange={(e) => setForm({ ...form, recurringMonthsLeft: e.target.value })} />
                  <p className="text-xs text-muted-foreground">Leave blank to repeat indefinitely</p>
                </div>
              )}
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}
            <button onClick={handleSubmit} disabled={submitting}
              className={`dashboard-primary-button w-full ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}>{submitting ? "Saving..." : "+ Add Expense"}</button>
          </div>

          <div className="panel-card">
            <h2 className="text-sm font-semibold mb-4">Daily Spending This Month</h2>
            {analytics?.dailySpending?.some((d) => d.total > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={analytics.dailySpending}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatINR} tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip labelPrefix="Day " valueLabel="Spent" />} cursor={false} />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Spent" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="dashboard-empty-state dashboard-empty-state-compact">
                <div className="dashboard-empty-icon dashboard-empty-icon-rose">EX</div>
                <p className="dashboard-empty-title">No expenses logged this month yet</p>
                <p className="dashboard-empty-copy">Your daily spending trend will appear here once expense entries are added.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Analytics */}
      {activeTab === "analytics" && analytics && (
        <div className="dashboard-tab-panel space-y-6">
          <div className="panel-card">
            <h2 className="text-sm font-semibold mb-4">Income vs Expenses - Last 6 Months</h2>
            {analytics.monthComparison?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.monthComparison}>
                  <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ComparisonTooltip />} cursor={false} />
                  <Legend />
                  <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="dashboard-empty-state dashboard-empty-state-compact">
                <div className="dashboard-empty-icon dashboard-empty-icon-violet">AN</div>
                <p className="dashboard-empty-title">No analytics for this period yet</p>
                <p className="dashboard-empty-copy">Add an expense entry to unlock month-by-month comparisons and category insights.</p>
                <button onClick={() => setActiveTab("add")} className="dashboard-primary-button">Get started by adding an expense</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {analytics.categoryBreakdown.length > 0 && (
              <div className="panel-card">
                <h2 className="text-sm font-semibold mb-4">Spending by Category</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      activeIndex={activeCategoryIndex >= 0 ? activeCategoryIndex : undefined}
                      data={analytics.categoryBreakdown} dataKey="total" nameKey="name"
                      cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={2}
                      onMouseEnter={(_, index) => setActiveCategory(analytics.categoryBreakdown[index]?.name || null)}
                      onMouseLeave={() => setActiveCategory(null)}
                      labelLine={false} label={renderCustomLabel}>
                      {analytics.categoryBreakdown.map((e) => (
                        <Cell
                          key={e.name}
                          fill={e.color}
                          fillOpacity={!activeCategory || activeCategory === e.name ? 1 : 0.35}
                          stroke={activeCategory === e.name ? "#ffffff" : "transparent"}
                          strokeWidth={activeCategory === e.name ? 4 : 0}
                        />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip content={<CategoryTooltip total={analytics.thisTotal} />} cursor={false} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {analytics.categoryBreakdown.length > 0 && (
              <div className="panel-card">
                <h2 className="text-sm font-semibold mb-4">Category Breakdown</h2>
                <div className="space-y-3">
                  {analytics.categoryBreakdown.map((cat) => {
                    const pct = analytics.thisTotal > 0 ? ((cat.total / analytics.thisTotal) * 100).toFixed(1) : 0;
                    return (
                      <div
                        key={cat.name}
                        className={`dashboard-breakdown-item ${activeCategory === cat.name ? "dashboard-breakdown-item-active" : ""}`}
                        onMouseEnter={() => setActiveCategory(cat.name)}
                        onMouseLeave={() => setActiveCategory(null)}
                      >
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{cat.icon} {cat.name}</span>
                          <span className="text-muted-foreground">{formatFullINR(cat.total)} · {pct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-secondary rounded-full">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {analytics.categoryBreakdown.length === 0 && (
              <div className="panel-card lg:col-span-2">
                <div className="dashboard-empty-state dashboard-empty-state-compact">
                  <div className="dashboard-empty-icon dashboard-empty-icon-sky">CT</div>
                  <p className="dashboard-empty-title">No category split available yet</p>
                  <p className="dashboard-empty-copy">Once you add expenses, this area will show what is driving your spending mix.</p>
                  <button onClick={() => setActiveTab("add")} className="dashboard-primary-button">Get started by adding an expense</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Forecast */}
      {activeTab === "forecast" && analytics && (
        <div className="dashboard-tab-panel space-y-6">
          <p className="text-sm text-muted-foreground">Projected next 6 months based on recurring income and expenses.</p>
          <div className="panel-card">
            <h2 className="text-sm font-semibold mb-4">6-Month Forecast</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={analytics.expenseForecast || []}>
                <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip labelFormatter={formatMonthKey} valueLabel="Projected" />} cursor={false} />
                <Legend />
                <Bar dataKey="projectedIncome" fill="#10b981" radius={[4, 4, 0, 0]} name="Projected Income" />
                <Bar dataKey="projectedExpenses" fill="#f97316" radius={[4, 4, 0, 0]} name="Projected Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {analytics.expenseForecast?.length > 0 && (
            <div className="panel-card overflow-x-auto">
              <h2 className="text-sm font-semibold mb-4">Forecast Breakdown</h2>
              <table className="w-full text-sm dashboard-data-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="pb-2 pr-4">Month</th>
                    <th className="pb-2 pr-4">Projected Income</th>
                    <th className="pb-2 pr-4">Projected Expenses</th>
                    <th className="pb-2">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {analytics.expenseForecast.map((row) => {
                    const net = row.projectedIncome - row.projectedExpenses;
                    return (
                      <tr key={row.month}>
                        <td className="py-2.5 pr-4 font-medium">{formatMonthKey(row.month)}</td>
                        <td className="py-2.5 pr-4 text-emerald-600">{formatFullINR(row.projectedIncome)}</td>
                        <td className="py-2.5 pr-4 text-orange-600">{formatFullINR(row.projectedExpenses)}</td>
                        <td className={`py-2.5 font-semibold ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatFullINR(net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Records */}
      {activeTab === "records" && (
        <div className="dashboard-tab-panel space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2">
              <button onClick={() => setFilterMode("month")}
                className={`dashboard-toggle-button ${filterMode === "month" ? "dashboard-toggle-button-active" : ""}`}>
                By Month
              </button>
              <button onClick={() => setFilterMode("year")}
                className={`dashboard-toggle-button ${filterMode === "year" ? "dashboard-toggle-button-active" : ""}`}>
                By Year
              </button>
            </div>
            {filterMode === "month" ? (
              <input type="month"
                className="dashboard-input"
                value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            ) : (
              <select className="dashboard-input"
                value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>

          <div className="panel-card">
            {expenses.length === 0 ? (
              <div className="dashboard-empty-state dashboard-empty-state-compact">
                <div className="dashboard-empty-icon dashboard-empty-icon-amber">0</div>
                <p className="dashboard-empty-title">No expenses for this period</p>
                <p className="dashboard-empty-copy">Change the filter or add a new expense to populate this table.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm dashboard-data-table">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="pb-2 pr-3">Date</th>
                      <th className="pb-2 pr-3">Category</th>
                      <th className="pb-2 pr-3">Amount</th>
                      <th className="pb-2 pr-3">Payment</th>
                      <th className="pb-2 pr-3">Note</th>
                      <th className="pb-2 pr-3">Recurring</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expenses.map((exp) => (
                      <tr key={exp._id} className="hover:bg-secondary/40 transition-colors">
                        {editingId === exp._id ? (
                          <>
                            <td className="py-2 pr-3 text-muted-foreground text-xs">
                              {new Date(exp.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </td>
                            <td className="py-2 pr-3">
                              <select className="rounded border border-border px-2 py-1 text-xs bg-background"
                                value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}>
                                {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                              </select>
                            </td>
                            <td className="py-2 pr-3">
                              <input type="number" className="rounded border border-border px-2 py-1 text-xs w-20 bg-background"
                                value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
                            </td>
                            <td className="py-2 pr-3">
                              <select className="rounded border border-border px-2 py-1 text-xs bg-background"
                                value={editForm.paymentMode} onChange={(e) => setEditForm({ ...editForm, paymentMode: e.target.value })}>
                                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </td>
                            <td className="py-2 pr-3">
                              <input type="text" className="rounded border border-border px-2 py-1 text-xs w-24 bg-background"
                                value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
                            </td>
                            <td className="py-2 pr-3 text-xs">
                              <input type="number" min="0" placeholder="months"
                                className="rounded border border-border px-2 py-1 text-xs w-16 bg-background"
                                value={editForm.recurringMonthsLeft}
                                onChange={(e) => setEditForm({ ...editForm, recurringMonthsLeft: e.target.value })} />
                            </td>
                            <td className="py-2 flex gap-2">
                              <button onClick={() => handleEditSave(exp._id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Save</button>
                              <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2.5 pr-3 text-muted-foreground text-xs">
                              {new Date(exp.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </td>
                            <td className="py-2.5 pr-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ backgroundColor: (exp.categoryId?.color || "#6b7280") + "20", color: exp.categoryId?.color || "#6b7280" }}>
                                {exp.categoryId?.icon} {exp.categoryId?.name}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 font-semibold text-red-600">{formatFullINR(exp.amount)}</td>
                            <td className="py-2.5 pr-3 text-muted-foreground text-xs">{exp.paymentMode}</td>
                            <td className="py-2.5 pr-3 text-muted-foreground max-w-[120px] truncate text-xs">{exp.note || "—"}</td>
                            <td className="py-2.5 pr-3 text-xs">
                              {exp.isRecurring ? (
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                                  {exp.recurringMonthsLeft > 0 ? `${exp.recurringMonthsLeft}mo left` : "Ongoing"}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="py-2.5 flex gap-2">
                              <button onClick={() => handleEdit(exp)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                              <button onClick={() => handleDeleteExpense(exp._id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Categories */}
      {activeTab === "categories" && (
        <div className="dashboard-tab-panel space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold">Your Categories</h2>
            <button onClick={() => setShowCatForm(!showCatForm)}
              className="dashboard-primary-button">
              + Add Category
            </button>
          </div>
          {showCatForm && (
            <div className="panel-card space-y-3 max-w-sm">
              <h3 className="text-sm font-semibold">New Category</h3>
              <input type="text"
                className="dashboard-input"
                placeholder="Category name" value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
              <div className="flex gap-3 items-center">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Color</label>
                  <input type="color" value={catForm.color}
                    onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                    className="w-10 h-8 rounded cursor-pointer border border-border" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">Type</label>
                  <div className="flex gap-2">
                    {["need", "want"].map((t) => (
                      <button key={t} onClick={() => setCatForm({ ...catForm, type: t })}
                        className={`dashboard-toggle-button flex-1 capitalize ${catForm.type === t ? "dashboard-toggle-button-active" : ""}`}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleAddCategory} className="dashboard-primary-button w-full">
                Save Category
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map((cat) => (
              <div key={cat._id} className="panel-card dashboard-category-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{cat.name}</p>
                    <span className={`dashboard-type-tag ${cat.type === "need" ? "dashboard-type-tag-need" : "dashboard-type-tag-want"}`}>
                      {cat.type}
                    </span>
                  </div>
                </div>
                {!cat.isDefault && (
                  <button onClick={() => handleDeleteCategory(cat._id)} className="text-xs text-red-400 hover:text-red-600">x</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label, labelFormatter, labelPrefix = "", valueLabel = "Value" }) {
  if (!active || !payload?.length) return null;
  const formattedLabel = labelFormatter ? labelFormatter(label) : `${labelPrefix}${label}`;
  return (
    <div className="dashboard-chart-tooltip">
      <p className="dashboard-chart-tooltip-label">{formattedLabel}</p>
      <div className="dashboard-chart-tooltip-row">
        <span>{valueLabel}</span>
        <strong>{formatFullINR(payload[0].value || 0)}</strong>
      </div>
    </div>
  );
}

function ComparisonTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const income = payload.find((item) => item.dataKey === "income")?.value || 0;
  const expenses = payload.find((item) => item.dataKey === "expenses")?.value || 0;
  const ratio = income > 0 ? `${((expenses / income) * 100).toFixed(1)}% of income` : "No income logged";
  return (
    <div className="dashboard-chart-tooltip">
      <p className="dashboard-chart-tooltip-label">{formatMonthKey(label)}</p>
      <div className="dashboard-chart-tooltip-row">
        <span>Income</span>
        <strong>{formatFullINR(income)}</strong>
      </div>
      <div className="dashboard-chart-tooltip-row">
        <span>Expenses</span>
        <strong>{formatFullINR(expenses)}</strong>
      </div>
      <p className="dashboard-chart-tooltip-meta">{ratio}</p>
    </div>
  );
}

function CategoryTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  const percentage = total > 0 ? `${((item.total / total) * 100).toFixed(1)}% of this month` : "No total yet";
  return (
    <div className="dashboard-chart-tooltip">
      <p className="dashboard-chart-tooltip-label">{item.icon} {item.name}</p>
      <div className="dashboard-chart-tooltip-row">
        <span>Spent</span>
        <strong>{formatFullINR(item.total)}</strong>
      </div>
      <p className="dashboard-chart-tooltip-meta">{percentage}</p>
    </div>
  );
}

function SummaryCard({ label, value, color, sub }) {
  const colors = {
    red: "dashboard-stat-card dashboard-stat-card-red",
    emerald: "dashboard-stat-card dashboard-stat-card-emerald",
    violet: "dashboard-stat-card dashboard-stat-card-violet",
    blue: "dashboard-stat-card dashboard-stat-card-blue",
  };
  return (
    <div className={colors[color]}>
      <p className="dashboard-stat-label">{label}</p>
      <p className="dashboard-stat-value dashboard-stat-value-sm">{value}</p>
      {sub && <p className="dashboard-stat-subtext">{sub}</p>}
    </div>
  );
}
