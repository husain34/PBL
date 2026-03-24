import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const API = "http://localhost:5000/api";

const SOURCE_COLORS = {
  Salary: "#3b82f6", Freelance: "#f59e0b",
  Business: "#10b981", Rental: "#8b5cf6", Other: "#6b7280",
};

const FREQ_LABELS = { "One-time": "One-time", Monthly: "Monthly", Weekly: "Weekly" };

function formatINR(amount) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
  return `₹${amount}`;
}
function formatFullINR(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(amount);
}
function formatMonthKey(key) {
  const [year, month] = key.split("-");
  return new Date(year, month - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

const EMPTY_FORM = {
  amount: "", source: "Salary", frequency: "Monthly",
  date: new Date().toISOString().split("T")[0], note: "",
};

export default function IncomePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    try {
      const [entriesRes, summaryRes] = await Promise.all([
        axios.get(`${API}/income`, { headers }),
        axios.get(`${API}/income/summary`, { headers }),
      ]);
      setEntries(entriesRes.data);
      setSummary(summaryRes.data);
    } catch {
      setError("Failed to load income data.");
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      setError("Please enter a valid amount."); return;
    }
    setSubmitting(true); setError(""); setSuccess("");
    try {
      await axios.post(`${API}/income`, { ...form, amount: Number(form.amount) }, { headers });
      const msg = form.source === "Salary"
        ? "Salary updated for this month!"
        : "Income entry added!";
      setSuccess(msg);
      setForm(EMPTY_FORM);
      await fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add entry.");
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/income/${id}`, { headers });
      await fetchData();
    } catch { setError("Failed to delete entry."); }
  };

  const hasData = entries.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Income Tracker</h1>
        <p className="text-muted-foreground mt-1 text-sm">Log and monitor all your income sources in one place.</p>
      </div>

      {/* Summary Cards — 3 cards, no income sources */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="This Month"
            value={formatFullINR(summary.thisMonthTotal)}
            color="blue"
            sub={summary.profileIncome ? `Declared range: ${summary.profileIncome}` : null}
          />
          <SummaryCard
            label="Projected Annual"
            value={formatFullINR(summary.projectedAnnual)}
            color="emerald"
            sub="Recurring income only"
          />
          <SummaryCard
            label="Savings Pot"
            value={formatFullINR(summary.savingsPot)}
            color="violet"
            sub="Available after expenses"
          />
        </div>
      )}

      {/* Profile nudge */}
      {summary?.profileIncome && summary.thisMonthTotal > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You declared <strong>{summary.profileIncome}</strong> as your income range during setup.
          You've logged <strong>{formatFullINR(summary.thisMonthTotal)}</strong> this month.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-1">
          <div className="auth-card space-y-4">
            <h2 className="text-base font-semibold">Add Income Entry</h2>

            {/* Salary notice */}
            {form.source === "Salary" && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Adding a salary for a month where one already exists will replace it automatically.
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (₹)</label>
              <input
                type="number" min="0"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 50000"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              >
                {Object.keys(SOURCE_COLORS).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Frequency</label>
              <div className="flex gap-2">
                {Object.keys(FREQ_LABELS).map((f) => (
                  <button
                    key={f}
                    onClick={() => setForm({ ...form, frequency: f })}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                      form.frequency === f
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-border text-muted-foreground hover:border-blue-300"
                    }`}
                  >{f}</button>
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
                placeholder="e.g. March salary"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}

            <button
              onClick={handleSubmit} disabled={submitting}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
                submitting ? "bg-secondary text-muted-foreground cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >{submitting ? "Saving..." : "+ Add Entry"}</button>
          </div>
        </div>

        {/* Charts */}
        <div className="lg:col-span-2 space-y-6">
          {!hasData ? (
            <div className="auth-card flex flex-col items-center justify-center py-16 text-center space-y-3">
              <p className="text-base font-semibold text-foreground">No income logged yet</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Add your first income entry using the form to start seeing your charts here.
              </p>
            </div>
          ) : (
            <>
              <div className="auth-card">
                <h2 className="text-sm font-semibold mb-4">Monthly Income — Last 6 Months</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={summary?.monthlyChart || []}>
                    <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v) => {
                        const total = (summary?.monthlyChart || []).reduce((s, m) => s + m.total, 0);
                        const pct = total > 0 ? ` (${((v / total) * 100).toFixed(1)}% of 6-month total)` : "";
                        return [`${formatFullINR(v)}${pct}`, "Income"];
                      }}
                      labelFormatter={formatMonthKey}
                    />
                    <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {summary?.sourceBreakdown?.length > 0 && (
                <div className="auth-card">
                  <h2 className="text-sm font-semibold mb-4">Income by Source</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={summary.sourceBreakdown}
                        dataKey="total" nameKey="source"
                        cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={3}
                      >
                        {summary.sourceBreakdown.map((entry) => (
                          <Cell key={entry.source} fill={SOURCE_COLORS[entry.source] || "#6b7280"} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip
                        formatter={(v, name) => {
                          const total = (summary?.sourceBreakdown || []).reduce((s, e) => s + e.total, 0);
                          const pct = total > 0 ? ` (${((v / total) * 100).toFixed(1)}%)` : "";
                          return [`${formatFullINR(v)}${pct}`, name];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Recent Entries Table */}
      <div className="auth-card">
        <h2 className="text-sm font-semibold mb-4">Recent Entries</h2>
        {!hasData ? (
          <p className="text-sm text-muted-foreground text-center py-6">No entries yet.</p>
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
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.slice(0, 10).map((entry) => (
                  <tr key={entry._id} className="hover:bg-secondary/40 transition-colors">
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: SOURCE_COLORS[entry.source] + "20", color: SOURCE_COLORS[entry.source] }}
                      >
                        {entry.source}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-semibold">{formatFullINR(entry.amount)}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground text-xs">{entry.frequency}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground max-w-[160px] truncate">{entry.note || "—"}</td>
                    <td className="py-2.5">
                      <button onClick={() => handleDelete(entry._id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries.length > 10 && (
              <p className="text-xs text-muted-foreground text-center mt-3">Showing 10 of {entries.length} entries.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, sub }) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
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