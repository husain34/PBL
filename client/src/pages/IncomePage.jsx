import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const API = "http://localhost:5000/api";

const SOURCE_COLORS = {
  Freelance: "#f59e0b", Business: "#10b981", Rental: "#8b5cf6", Other: "#6b7280",
};
const NON_SALARY_SOURCES = ["Freelance", "Business", "Rental", "Other"];
const FREQ_LABELS = { "One-time": "One-time", Monthly: "Monthly", Weekly: "Weekly" };

function formatINR(v) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v}`;
}
function formatFullINR(v) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
}
function formatMonthKey(key) {
  const [y, m] = key.split("-");
  return new Date(y, m - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}
const today = new Date().toISOString().split("T")[0];

const EMPTY_FORM = { amount: "",                        source: "Freelance", frequency: "Monthly", date: today, note: "" };
const currentYear = new Date().getFullYear();
const currentMonthNum = new Date().getMonth() + 1;
const currentMonth = String(currentMonthNum).padStart(2, "0");

// Generate months: current month and 11 months back (1 year of past data)
const generatePastMonths = () => {
  const months = [];
  let year = currentYear;
  let month = currentMonthNum;
  for (let i = 0; i < 12; i++) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
  }
  return months;
};
const PAST_MONTHS = generatePastMonths();

export default function IncomePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(`${currentYear}-${currentMonth}`);
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryNote, setSalaryNote] = useState("");
  const [currentSalary, setCurrentSalary] = useState(null);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [salarySubmitting, setSalarySubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    try {
      const [entriesRes, summaryRes, salaryRes] = await Promise.all([
        axios.get(`${API}/income`, { headers }),
        axios.get(`${API}/income/summary`, { headers }),
        axios.get(`${API}/income/salary?month=${selectedMonth}`, { headers }),
      ]);
      setEntries(entriesRes.data.filter((e) => e.source !== "Salary"));
      setSummary(summaryRes.data);
      const sal = salaryRes.data.entry;
      setCurrentSalary(sal);
      if (sal) setSalaryAmount(sal.amount);
      else setSalaryAmount("");
    } catch { setError("Failed to load income data."); }
  }, [selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSalarySubmit = async () => {
    if (!salaryAmount || Number(salaryAmount) <= 0) { setError("Enter a valid salary amount."); return; }
    setSalarySubmitting(true); setError(""); setSuccess("");
    try {
      await axios.put(`${API}/income/salary`, { amount: Number(salaryAmount), note: salaryNote, month: selectedMonth }, { headers });
      setSuccess(currentSalary ? "Salary updated!" : "Salary set for this month!");
      await fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed to update salary."); }
    finally { setSalarySubmitting(false); }
  };

  const handleSubmit = async () => {
    if (!form.amount || Number(form.amount) <= 0) { setError("Enter a valid amount."); return; }
    if (form.date > today) { setError("Cannot log income for a future date."); return; }
    setSubmitting(true); setError(""); setSuccess("");
    try {
      await axios.post(`${API}/income`, { ...form, amount: Number(form.amount) }, { headers });
      setSuccess("Income entry added!");
      setForm(EMPTY_FORM);
      await fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed to add entry."); }
    finally { setSubmitting(false); }
  };

  const handleEdit = (entry) => {
    setEditingId(entry._id);
    setEditForm({ amount: entry.amount, source: entry.source, frequency: entry.frequency, note: entry.note || "" });
  };

  const handleEditSave = async (id) => {
    try {
      await axios.put(`${API}/income/${id}`, { ...editForm, amount: Number(editForm.amount) }, { headers });
      setEditingId(null);
      await fetchData();
    } catch (err) { setError(err.response?.data?.message || "Failed to update."); }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/income/${id}`, { headers });
      await fetchData();
    } catch { setError("Failed to delete entry."); }
  };

  const hasData = entries.length > 0 || currentSalary;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Income Tracker</h1>
        <p className="text-muted-foreground mt-1 text-sm">Log and monitor all your income sources.</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard label="This Month" value={formatFullINR(summary.thisMonthTotal)} color="blue"
            sub={summary.profileIncome ? `Declared range: ${summary.profileIncome}` : null} />
        </div>
      )}

      {summary?.profileIncome && summary.thisMonthTotal > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You declared <strong>{summary.profileIncome}</strong> during setup.
          You've logged <strong>{formatFullINR(summary.thisMonthTotal)}</strong> this month.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">

          {/* Salary Card — with month picker */}
          <div className="auth-card space-y-3 border-2 border-blue-100">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-blue-700">Monthly Salary</h2>
              {currentSalary && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold">
                  Set
                </span>
              )}
            </div>
            
            {/* Month Picker */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select Month</label>
              <select className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}>
                {PAST_MONTHS.map((monthStr) => {
                  const [year, month] = monthStr.split("-");
                  const monthName = new Date(Number(year), Number(month) - 1).toLocaleString("default", { month: "long", year: "numeric" });
                  return <option key={monthStr} value={monthStr}>{monthName}</option>;
                })}
              </select>
            </div>

            {currentSalary && (
              <p className="text-xs text-muted-foreground">
                Current: <span className="font-semibold text-foreground">{formatFullINR(currentSalary.amount)}</span>
              </p>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {currentSalary ? "Update Amount (₹)" : "Set Amount (₹)"}
              </label>
              <input
                type="number" min="0"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 60000"
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note (optional)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. With bonus"
                value={salaryNote}
                onChange={(e) => setSalaryNote(e.target.value)}
              />
            </div>
            <button
              onClick={handleSalarySubmit} disabled={salarySubmitting}
              className={`w-full rounded-xl py-2 text-sm font-semibold transition-all ${
                salarySubmitting ? "bg-secondary text-muted-foreground cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >{salarySubmitting ? "Saving..." : currentSalary ? "Update Salary" : "Set Salary"}</button>
          </div>

          {/* Other Income Form */}
          <div className="auth-card space-y-4">
            <h2 className="text-base font-semibold">Add Other Income</h2>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (₹)</label>
              <input type="number" min="0"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 10000" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</label>
              <select className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {NON_SALARY_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Frequency</label>
              <div className="flex gap-2">
                {Object.keys(FREQ_LABELS).map((f) => (
                  <button key={f} onClick={() => setForm({ ...form, frequency: f })}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                      form.frequency === f ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-blue-300"
                    }`}>{f}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</label>
              <input type="date" max={today}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note (optional)</label>
              <input type="text"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Freelance project" value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}
            <button onClick={handleSubmit} disabled={submitting}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
                submitting ? "bg-secondary text-muted-foreground cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}>{submitting ? "Saving..." : "+ Add Entry"}</button>
          </div>
        </div>

        {/* Charts */}
        <div className="lg:col-span-2 space-y-6">
          {!hasData ? (
            <div className="auth-card flex flex-col items-center justify-center py-16 text-center space-y-3">
              <p className="text-base font-semibold">No income logged yet</p>
              <p className="text-sm text-muted-foreground max-w-xs">Set your salary or add an income entry to see charts.</p>
            </div>
          ) : (
            <>
              <div className="auth-card">
                <h2 className="text-sm font-semibold mb-4">Monthly Income — Last 6 Months</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={summary?.monthlyChart || []}>
                    <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => {
                      const total = (summary?.monthlyChart || []).reduce((s, m) => s + m.total, 0);
                      const pct = total > 0 ? ` (${((v / total) * 100).toFixed(1)}% of 6-month total)` : "";
                      return [`${formatFullINR(v)}${pct}`, "Income"];
                    }} labelFormatter={formatMonthKey} />
                    <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 6-month forecast */}
              {summary?.forecast?.length > 0 && (
                <div className="auth-card">
                  <h2 className="text-sm font-semibold mb-1">6-Month Forecast</h2>
                  <p className="text-xs text-muted-foreground mb-4">Based on recurring monthly income</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={summary.forecast}>
                      <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [formatFullINR(v), "Projected"]} labelFormatter={formatMonthKey} />
                      <Bar dataKey="projected" fill="#a5b4fc" radius={[4, 4, 0, 0]} name="Projected Income" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {summary?.sourceBreakdown?.length > 0 && (
                <div className="auth-card">
                  <h2 className="text-sm font-semibold mb-4">Income by Source</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={summary.sourceBreakdown} dataKey="total" nameKey="source"
                        cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={3}>
                        {summary.sourceBreakdown.map((entry) => (
                          <Cell key={entry.source} fill={entry.source === "Salary" ? "#3b82f6" : SOURCE_COLORS[entry.source] || "#6b7280"} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip formatter={(v, name) => {
                        const total = (summary?.sourceBreakdown || []).reduce((s, e) => s + e.total, 0);
                        const pct = total > 0 ? ` (${((v / total) * 100).toFixed(1)}%)` : "";
                        return [`${formatFullINR(v)}${pct}`, name];
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Entries Table */}
      <div className="auth-card">
        <h2 className="text-sm font-semibold mb-4">Other Income Entries</h2>
        {!hasData || entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No other income entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">Frequency</th>
                  <th className="pb-2 pr-4">Note</th>
                  <th className="pb-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.slice(0, 10).map((entry) => (
                  <tr key={entry._id} className="hover:bg-secondary/40 transition-colors">
                    {editingId === entry._id ? (
                      <>
                        <td className="py-2 pr-4 text-muted-foreground text-xs">
                          {new Date(entry.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="py-2 pr-4">
                          <select className="rounded border border-border px-2 py-1 text-xs bg-background"
                            value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}>
                            {NON_SALARY_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <input type="number" className="rounded border border-border px-2 py-1 text-xs w-24 bg-background"
                            value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
                        </td>
                        <td className="py-2 pr-4">
                          <select className="rounded border border-border px-2 py-1 text-xs bg-background"
                            value={editForm.frequency} onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value })}>
                            {Object.keys(FREQ_LABELS).map((f) => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <input type="text" className="rounded border border-border px-2 py-1 text-xs w-28 bg-background"
                            value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
                        </td>
                        <td className="py-2 pr-4 flex gap-2">
                          <button onClick={() => handleEditSave(entry._id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {new Date(entry.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: (SOURCE_COLORS[entry.source] || "#6b7280") + "20", color: SOURCE_COLORS[entry.source] || "#6b7280" }}>
                            {entry.source}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-semibold">{formatFullINR(entry.amount)}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground text-xs">{entry.frequency}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground max-w-[140px] truncate">{entry.note || "—"}</td>
                        <td className="py-2.5 pr-4 flex gap-3">
                          <button onClick={() => handleEdit(entry)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors">Edit</button>
                          <button onClick={() => handleDelete(entry._id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Delete</button>
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
  );
}

function SummaryCard({ label, value, color, sub }) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}