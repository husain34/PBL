import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from "recharts";

const API = "http://localhost:5000/api";

function formatFullINR(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(amount);
}
function formatINR(amount) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
  return `₹${amount}`;
}
function formatMonthKey(key) {
  const [year, month] = key.split("-");
  return new Date(year, month - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

// Custom label for donut chart slices
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="600">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const PAYMENT_MODES = ["Cash", "UPI", "Card", "Net Banking", "Other"];
const EMPTY_FORM = {
  amount: "", categoryId: "", date: new Date().toISOString().split("T")[0],
  note: "", paymentMode: "UPI", isRecurring: false,
};
const EMPTY_CAT_FORM = { name: "", color: "#6b7280", type: "want" };

export default function ExpensePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [catForm, setCatForm] = useState(EMPTY_CAT_FORM);
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  );
  const [showCatForm, setShowCatForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("add");
  const [recurringNotice, setRecurringNotice] = useState("");

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchAll = useCallback(async () => {
    try {
      const [catRes, expRes, analyticsRes] = await Promise.all([
        axios.get(`${API}/categories`, { headers }),
        axios.get(`${API}/expenses?month=${selectedMonth}`, { headers }),
        axios.get(`${API}/expenses/analytics`, { headers }),
      ]);
      setCategories(catRes.data);
      setExpenses(expRes.data);
      setAnalytics(analyticsRes.data);
      if (catRes.data.length > 0 && !form.categoryId)
        setForm((f) => ({ ...f, categoryId: catRes.data[0]._id }));
    } catch {
      setError("Failed to load data.");
    }
  }, [selectedMonth]);

  // On mount: trigger recurring expense auto-population
  useEffect(() => {
    axios.post(`${API}/expenses/apply-recurring`, {}, { headers })
      .then((res) => {
        if (res.data.applied > 0)
          setRecurringNotice(`${res.data.applied} recurring expense(s) auto-added for this month.`);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSubmit = async () => {
    if (!form.amount || !form.categoryId || !form.date) {
      setError("Please fill in amount, category and date."); return;
    }
    if (analytics && Number(form.amount) > analytics.savingsPot) {
      setError(`Amount exceeds your savings pot balance of ${formatFullINR(analytics.savingsPot)}.`);
      return;
    }
    setSubmitting(true); setError(""); setSuccess("");
    try {
      await axios.post(`${API}/expenses`, form, { headers });
      setSuccess("Expense added!");
      setForm({ ...EMPTY_FORM, categoryId: form.categoryId });
      await fetchAll();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add expense.");
    } finally { setSubmitting(false); }
  };

  const handleAddCategory = async () => {
    if (!catForm.name) { setError("Category name is required."); return; }
    try {
      await axios.post(`${API}/categories`, catForm, { headers });
      setCatForm(EMPTY_CAT_FORM);
      setShowCatForm(false);
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add category.");
    }
  };

  const handleDeleteExpense = async (id) => {
    try {
      await axios.delete(`${API}/expenses/${id}`, { headers });
      await fetchAll();
    } catch { setError("Failed to delete."); }
  };

  const handleDeleteCategory = async (id) => {
    try {
      await axios.delete(`${API}/categories/${id}`, { headers });
      await fetchAll();
    } catch { setError("Cannot delete default category."); }
  };

  const monthChange = analytics ? analytics.thisTotal - analytics.prevTotal : 0;
  const monthChangePercent = analytics?.prevTotal
    ? ((monthChange / analytics.prevTotal) * 100).toFixed(1) : null;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Expense Tracker</h1>
        <p className="text-muted-foreground mt-1 text-sm">Track, categorize and analyze your spending.</p>
      </div>

      {/* Recurring notice */}
      {recurringNotice && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center justify-between">
          <span>{recurringNotice}</span>
          <button onClick={() => setRecurringNotice("")} className="text-blue-400 hover:text-blue-600 ml-4">×</button>
        </div>
      )}

      {/* Summary Cards */}
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="This Month" value={formatFullINR(analytics.thisTotal)} color="red" />
          <SummaryCard
            label="vs Last Month"
            value={monthChange >= 0 ? `+${formatFullINR(monthChange)}` : formatFullINR(monthChange)}
            sub={monthChangePercent ? `${monthChangePercent}% change` : null}
            color={monthChange <= 0 ? "emerald" : "red"}
          />
          <SummaryCard
            label="Savings This Month"
            value={formatFullINR(analytics.netSavings)}
            sub="Income minus expenses"
            color={analytics.netSavings >= 0 ? "emerald" : "red"}
          />
          <SummaryCard
            label="Overall Savings"
            value={formatFullINR(analytics.overallSavings)}
            sub="All-time income minus expenses"
            color={analytics.overallSavings >= 0 ? "emerald" : "red"}
          />
        </div>
      )}

      {/* Savings pot indicator */}
      {analytics && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
          <span>Savings Pot Available: <strong>{formatFullINR(analytics.savingsPot)}</strong></span>
          <span className="text-xs text-emerald-600">Expenses cannot exceed this balance</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {["add", "analytics", "records", "categories"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-all border-b-2 -mb-px ${
              activeTab === tab
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab: Add Expense */}
      {activeTab === "add" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="auth-card space-y-4">
            <h2 className="text-base font-semibold">Add Expense</h2>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (₹)</label>
              <input
                type="number" min="0"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 500"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              {analytics && form.amount && Number(form.amount) > analytics.savingsPot && (
                <p className="text-xs text-red-500 mt-1">
                  Exceeds savings pot ({formatFullINR(analytics.savingsPot)})
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment Mode</label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => setForm({ ...form, paymentMode: m })}
                    className={`px-3 py-1 rounded-lg border text-xs font-medium transition-all ${
                      form.paymentMode === m
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-border text-muted-foreground hover:border-blue-300"
                    }`}
                  >{m}</button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note (optional)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Lunch with team"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
                className="rounded"
              />
              <span className="text-muted-foreground">Mark as recurring (auto-adds every month)</span>
            </label>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}

            <button
              onClick={handleSubmit} disabled={submitting}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
                submitting ? "bg-secondary text-muted-foreground cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >{submitting ? "Saving..." : "+ Add Expense"}</button>
          </div>

          {/* Daily spending chart on add tab */}
          <div className="space-y-4">
            <div className="auth-card">
              <h2 className="text-sm font-semibold mb-4">Daily Spending This Month</h2>
              {analytics?.dailySpending?.some((d) => d.total > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={analytics.dailySpending}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={formatINR} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(v) => formatFullINR(v)}
                      labelFormatter={(d) => `Day ${d}`}
                    />
                    <Line
                      type="monotone" dataKey="total" stroke="#3b82f6"
                      strokeWidth={2} dot={false} name="Spent"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No expenses logged this month yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Analytics */}
      {activeTab === "analytics" && analytics && (
        <div className="space-y-6">
          <div className="auth-card">
            <h2 className="text-sm font-semibold mb-4">Income vs Expenses vs Goals — Last 6 Months</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={analytics.monthComparison}>
                <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, name, props) => {
                    const income = props.payload?.income || 0;
                    const pct = income > 0 ? ` (${((v / income) * 100).toFixed(1)}% of income)` : "";
                    const label = name === "Income" ? formatFullINR(v) : `${formatFullINR(v)}${pct}`;
                    return [label, name];
                  }}
                  labelFormatter={formatMonthKey}
                />
                <Legend />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
                <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                <Bar dataKey="goalsAllocated" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Allocated to Goals" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {analytics.categoryBreakdown.length > 0 && (
              <div className="auth-card">
                <h2 className="text-sm font-semibold mb-4">Spending by Category</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={analytics.categoryBreakdown}
                      dataKey="total" nameKey="name"
                      cx="50%" cy="50%"
                      outerRadius={85} innerRadius={45}
                      paddingAngle={2}
                      labelLine={false}
                      label={renderCustomLabel}
                    >
                      {analytics.categoryBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip formatter={(v, name) => {
                      const total = analytics.thisTotal;
                      const pct = total > 0 ? ((v / total) * 100).toFixed(1) : 0;
                      return [`${formatFullINR(v)} (${pct}%)`, name];
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
                    const pct = analytics.thisTotal > 0
                      ? ((cat.total / analytics.thisTotal) * 100).toFixed(1) : 0;
                    return (
                      <div key={cat.name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{cat.icon} {cat.name}</span>
                          <span className="text-muted-foreground">{formatFullINR(cat.total)} · {pct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-secondary rounded-full">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: cat.color }}
                          />
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

      {/* Tab: Records */}
      {activeTab === "records" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground">Filter by month:</label>
            <input
              type="month"
              className="rounded-lg border border-border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
          <div className="auth-card">
            {expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No expenses for this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4">Category</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2 pr-4">Payment</th>
                      <th className="pb-2 pr-4">Note</th>
                      <th className="pb-2 pr-4">Recurring</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expenses.map((exp) => (
                      <tr key={exp._id} className="hover:bg-secondary/40 transition-colors">
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {new Date(exp.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: (exp.categoryId?.color || "#6b7280") + "20", color: exp.categoryId?.color || "#6b7280" }}
                          >
                            {exp.categoryId?.icon} {exp.categoryId?.name}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-semibold text-red-600">{formatFullINR(exp.amount)}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground text-xs">{exp.paymentMode}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground max-w-[140px] truncate">{exp.note || "—"}</td>
                        <td className="py-2.5 pr-4 text-xs">
                          {exp.isRecurring
                            ? <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Recurring</span>
                            : "—"}
                        </td>
                        <td className="py-2.5">
                          <button onClick={() => handleDeleteExpense(exp._id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                            Delete
                          </button>
                        </td>
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
            <button
              onClick={() => setShowCatForm(!showCatForm)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              + Add Category
            </button>
          </div>

          {showCatForm && (
            <div className="auth-card space-y-3 max-w-sm">
              <h3 className="text-sm font-semibold">New Category</h3>
              <input
                type="text"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Category name"
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              />
              <div className="flex gap-3 items-center">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Color</label>
                  <input type="color" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} className="w-10 h-8 rounded cursor-pointer border border-border" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">Type</label>
                  <div className="flex gap-2">
                    {["need", "want"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setCatForm({ ...catForm, type: t })}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-medium capitalize transition-all ${
                          catForm.type === t ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground"
                        }`}
                      >{t}</button>
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
                  <button onClick={() => handleDeleteCategory(cat._id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">×</button>
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