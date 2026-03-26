import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from "recharts";

const API = "http://localhost:5000/api";

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

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Expense Tracker</h1>
        <p className="text-muted-foreground mt-1 text-sm">Track, categorize and analyze your spending.</p>
      </div>

      {recurringNotice && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center justify-between">
          <span>{recurringNotice}</span>
          <button onClick={() => setRecurringNotice("")} className="text-blue-400 hover:text-blue-600 ml-4">×</button>
        </div>
      )}

      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
          <span>Total Balance: <strong>{formatFullINR(analytics.totalBalance)}</strong></span>
          <span className="text-xs text-emerald-600">Expenses cannot exceed this</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {["add", "analytics", "forecast", "records", "categories"].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-all border-b-2 -mb-px ${
              activeTab === tab ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>{tab}</button>
        ))}
      </div>

      {/* Tab: Add */}
      {activeTab === "add" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="auth-card space-y-4">
            <h2 className="text-base font-semibold">Add Expense</h2>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (₹)</label>
              <input type="number" min="0"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 500" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              {analytics && form.amount && Number(form.amount) > analytics.totalBalance && (
                <p className="text-xs text-red-500 mt-1">Exceeds total balance ({formatFullINR(analytics.totalBalance)})</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</label>
              <select className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                {categories.map((c) => <option key={c._id} value={c._id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment Mode</label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_MODES.map((m) => (
                  <button key={m} onClick={() => setForm({ ...form, paymentMode: m })}
                    className={`px-3 py-1 rounded-lg border text-xs font-medium transition-all ${
                      form.paymentMode === m ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-blue-300"
                    }`}>{m}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</label>
              <input type="date"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note (optional)</label>
              <input type="text"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Repeat for how many months?</label>
                  <input type="number" min="1"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave blank for indefinite" value={form.recurringMonthsLeft}
                    onChange={(e) => setForm({ ...form, recurringMonthsLeft: e.target.value })} />
                  <p className="text-xs text-muted-foreground">Leave blank to repeat indefinitely</p>
                </div>
              )}
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}
            <button onClick={handleSubmit} disabled={submitting}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
                submitting ? "bg-secondary text-muted-foreground cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}>{submitting ? "Saving..." : "+ Add Expense"}</button>
          </div>

          <div className="auth-card">
            <h2 className="text-sm font-semibold mb-4">Daily Spending This Month</h2>
            {analytics?.dailySpending?.some((d) => d.total > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={analytics.dailySpending}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatINR} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => formatFullINR(v)} labelFormatter={(d) => `Day ${d}`} />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Spent" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">No expenses logged this month yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Analytics */}
      {activeTab === "analytics" && analytics && (
        <div className="space-y-6">
          <div className="auth-card">
            <h2 className="text-sm font-semibold mb-4">Income vs Expenses — Last 6 Months</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={analytics.monthComparison}>
                <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, name, props) => {
                  const income = props.payload?.income || 0;
                  const pct = income > 0 && name !== "Income" ? ` (${((v / income) * 100).toFixed(1)}% of income)` : "";
                  return [`${formatFullINR(v)}${pct}`, name];
                }} labelFormatter={formatMonthKey} />
                <Legend />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
                <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {analytics.categoryBreakdown.length > 0 && (
              <div className="auth-card">
                <h2 className="text-sm font-semibold mb-4">Spending by Category</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={analytics.categoryBreakdown} dataKey="total" nameKey="name"
                      cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={2}
                      labelLine={false} label={renderCustomLabel}>
                      {analytics.categoryBreakdown.map((e) => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <Legend />
                    <Tooltip formatter={(v, name) => {
                      const pct = analytics.thisTotal > 0 ? ` (${((v / analytics.thisTotal) * 100).toFixed(1)}%)` : "";
                      return [`${formatFullINR(v)}${pct}`, name];
                    }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {analytics.categoryBreakdown.length > 0 && (
              <div className="auth-card">
                <h2 className="text-sm font-semibold mb-4">Category Breakdown</h2>
                <div className="space-y-3">
                  {analytics.categoryBreakdown.map((cat) => {
                    const pct = analytics.thisTotal > 0 ? ((cat.total / analytics.thisTotal) * 100).toFixed(1) : 0;
                    return (
                      <div key={cat.name}>
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
          </div>
        </div>
      )}

      {/* Tab: Forecast */}
      {activeTab === "forecast" && analytics && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">Projected next 6 months based on recurring income and expenses.</p>
          <div className="auth-card">
            <h2 className="text-sm font-semibold mb-4">6-Month Forecast</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={analytics.expenseForecast || []}>
                <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatFullINR(v)} labelFormatter={formatMonthKey} />
                <Legend />
                <Bar dataKey="projectedIncome" fill="#10b981" radius={[4, 4, 0, 0]} name="Projected Income" />
                <Bar dataKey="projectedExpenses" fill="#f97316" radius={[4, 4, 0, 0]} name="Projected Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {analytics.expenseForecast?.length > 0 && (
            <div className="auth-card overflow-x-auto">
              <h2 className="text-sm font-semibold mb-4">Forecast Breakdown</h2>
              <table className="w-full text-sm">
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
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2">
              <button onClick={() => setFilterMode("month")}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${filterMode === "month" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground"}`}>
                By Month
              </button>
              <button onClick={() => setFilterMode("year")}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${filterMode === "year" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground"}`}>
                By Year
              </button>
            </div>
            {filterMode === "month" ? (
              <input type="month"
                className="rounded-lg border border-border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            ) : (
              <select className="rounded-lg border border-border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>

          <div className="auth-card">
            {expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No expenses for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
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
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold">Your Categories</h2>
            <button onClick={() => setShowCatForm(!showCatForm)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
              + Add Category
            </button>
          </div>
          {showCatForm && (
            <div className="auth-card space-y-3 max-w-sm">
              <h3 className="text-sm font-semibold">New Category</h3>
              <input type="text"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-medium capitalize transition-all ${
                          catForm.type === t ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground"
                        }`}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleAddCategory} className="w-full rounded-xl py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                Save Category
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map((cat) => (
              <div key={cat._id} className="auth-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{cat.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{cat.type}</p>
                  </div>
                </div>
                {!cat.isDefault && (
                  <button onClick={() => handleDeleteCategory(cat._id)} className="text-xs text-red-400 hover:text-red-600">×</button>
                )}
              </div>
            ))}
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
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}