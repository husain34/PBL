import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const API = "http://localhost:5000/api";

const SOURCE_COLORS = {
  Freelance: "#f59e0b",
  Business: "#10b981",
  Rental: "#8b5cf6",
  Other: "#6b7280",
};
const NON_SALARY_SOURCES = ["Freelance", "Business", "Rental", "Other"];
const FREQ_LABELS = { "One-time": "One-time", Monthly: "Monthly", Weekly: "Weekly" };

function formatINR(v) {
  if (v >= 100000) return `INR ${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `INR ${(v / 1000).toFixed(1)}k`;
  return `INR ${v}`;
}

function formatFullINR(v) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatMonthKey(key) {
  const [y, m] = key.split("-");
  return new Date(y, m - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

const today = new Date().toISOString().split("T")[0];

const EMPTY_FORM = {
  amount: "",
  source: "Freelance",
  frequency: "Monthly",
  date: today,
  note: "",
};

const currentYear = new Date().getFullYear();
const currentMonthNum = new Date().getMonth() + 1;
const currentMonth = String(currentMonthNum).padStart(2, "0");

const generatePastMonths = () => {
  const months = [];
  let year = currentYear;
  let month = currentMonthNum;

  for (let i = 0; i < 12; i++) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
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
  const [expenseAnalytics, setExpenseAnalytics] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [salarySubmitting, setSalarySubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    try {
      const [entriesRes, summaryRes, salaryRes, expenseAnalyticsRes] = await Promise.all([
        axios.get(`${API}/income`, { headers }),
        axios.get(`${API}/income/summary`, { headers }),
        axios.get(`${API}/income/salary?month=${selectedMonth}`, { headers }),
        axios.get(`${API}/expenses/analytics`, { headers }),
      ]);

      setEntries(entriesRes.data.filter((e) => e.source !== "Salary"));
      setSummary(summaryRes.data);
      setExpenseAnalytics(expenseAnalyticsRes.data);

      const salaryEntry = salaryRes.data.entry;
      setCurrentSalary(salaryEntry);
      setSalaryAmount(salaryEntry ? salaryEntry.amount : "");
    } catch {
      setError("Failed to load income data.");
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSalarySubmit = async () => {
    if (!salaryAmount || Number(salaryAmount) <= 0) {
      setError("Enter a valid salary amount.");
      return;
    }

    setSalarySubmitting(true);
    setError("");
    setSuccess("");

    try {
      await axios.put(
        `${API}/income/salary`,
        { amount: Number(salaryAmount), note: salaryNote, month: selectedMonth },
        { headers }
      );

      setSuccess(currentSalary ? "Salary updated!" : "Salary set for this month!");
      await fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update salary.");
    } finally {
      setSalarySubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (form.date > today) {
      setError("Cannot log income for a future date.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await axios.post(`${API}/income`, { ...form, amount: Number(form.amount) }, { headers });
      setSuccess("Income entry added!");
      setForm(EMPTY_FORM);
      await fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add entry.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (entry) => {
    setEditingId(entry._id);
    setEditForm({
      amount: entry.amount,
      source: entry.source,
      frequency: entry.frequency,
      note: entry.note || "",
    });
  };

  const handleEditSave = async (id) => {
    try {
      await axios.put(`${API}/income/${id}`, { ...editForm, amount: Number(editForm.amount) }, { headers });
      setEditingId(null);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update.");
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/income/${id}`, { headers });
      await fetchData();
    } catch {
      setError("Failed to delete entry.");
    }
  };

  const hasData = entries.length > 0 || currentSalary;
  const forecastMap = new Map((summary?.forecast || []).map((item) => [item.month, { month: item.month, projectedIncome: item.projected, projectedExpenses: 0 }]));

  (expenseAnalytics?.expenseForecast || []).forEach((item) => {
    const existing = forecastMap.get(item.month) || { month: item.month, projectedIncome: 0, projectedExpenses: 0 };
    existing.projectedExpenses = item.projectedExpenses || 0;
    forecastMap.set(item.month, existing);
  });

  const combinedForecast = Array.from(forecastMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div className="dashboard-shell space-y-8">
      <section className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">Income Center</p>
          <h1 className="dashboard-title dashboard-page-title">Income Tracker</h1>
          <p className="dashboard-subtitle">
            Log salary, track side income, and review the momentum of your cash inflow with a cleaner dashboard layout.
          </p>
        </div>
      </section>

      {summary && (
        <div className="dashboard-stat-grid dashboard-stat-grid-compact">
          <SummaryCard
            label="This Month"
            value={formatFullINR(summary.thisMonthTotal)}
            color="blue"
            sub={summary.profileIncome ? `Declared range: ${summary.profileIncome}` : null}
          />
        </div>
      )}

      {summary?.profileIncome && summary.thisMonthTotal > 0 && (
        <div className="dashboard-soft-banner dashboard-soft-banner-amber">
          You declared <strong>{summary.profileIncome}</strong> during setup. You have logged{" "}
          <strong>{formatFullINR(summary.thisMonthTotal)}</strong> this month.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="panel-card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Monthly Salary</h2>
              {currentSalary && <span className="dashboard-inline-badge dashboard-inline-badge-blue">Set</span>}
            </div>

            <div className="space-y-1">
              <label className="dashboard-field-label">Select Month</label>
              <select
                className="dashboard-input cursor-pointer"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {PAST_MONTHS.map((monthStr) => {
                  const [year, month] = monthStr.split("-");
                  const monthName = new Date(Number(year), Number(month) - 1).toLocaleString("default", {
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <option key={monthStr} value={monthStr}>
                      {monthName}
                    </option>
                  );
                })}
              </select>
            </div>

            {currentSalary && (
              <p className="text-xs text-muted-foreground">
                Current: <span className="font-semibold text-foreground">{formatFullINR(currentSalary.amount)}</span>
              </p>
            )}

            <div className="space-y-1">
              <label className="dashboard-field-label">{currentSalary ? "Update Amount (INR)" : "Set Amount (INR)"}</label>
              <input
                type="number"
                min="0"
                className="dashboard-input"
                placeholder="e.g. 60000"
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="dashboard-field-label">Note (optional)</label>
              <input
                type="text"
                className="dashboard-input"
                placeholder="e.g. With bonus"
                value={salaryNote}
                onChange={(e) => setSalaryNote(e.target.value)}
              />
            </div>

            <button
              onClick={handleSalarySubmit}
              disabled={salarySubmitting}
              className={`dashboard-primary-button w-full ${salarySubmitting ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {salarySubmitting ? "Saving..." : currentSalary ? "Update Salary" : "Set Salary"}
            </button>
          </div>

          <div className="panel-card space-y-4">
            <h2 className="text-base font-semibold">Add Other Income</h2>

            <div className="space-y-1">
              <label className="dashboard-field-label">Amount (INR)</label>
              <input
                type="number"
                min="0"
                className="dashboard-input"
                placeholder="e.g. 10000"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="dashboard-field-label">Source</label>
              <select
                className="dashboard-input"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              >
                {NON_SALARY_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="dashboard-field-label">Frequency</label>
              <div className="flex gap-2">
                {Object.keys(FREQ_LABELS).map((f) => (
                  <button
                    key={f}
                    onClick={() => setForm({ ...form, frequency: f })}
                    className={`dashboard-toggle-button flex-1 ${form.frequency === f ? "dashboard-toggle-button-active" : ""}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="dashboard-field-label">Date</label>
              <input
                type="date"
                max={today}
                className="dashboard-input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="dashboard-field-label">Note (optional)</label>
              <input
                type="text"
                className="dashboard-input"
                placeholder="e.g. Freelance project"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`dashboard-primary-button w-full ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {submitting ? "Saving..." : "+ Add Entry"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!hasData ? (
            <div className="panel-card">
              <div className="dashboard-empty-state">
                <div className="dashboard-empty-icon dashboard-empty-icon-violet">IN</div>
                <p className="dashboard-empty-title">No income logged yet</p>
                <p className="dashboard-empty-copy">Set your salary or add an income entry to unlock the charts.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-card">
                <h2 className="text-sm font-semibold mb-4">Monthly Income - Last 6 Months</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={summary?.monthlyChart || []}>
                    <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                    <Tooltip
                      cursor={false}
                      formatter={(v) => {
                        const total = (summary?.monthlyChart || []).reduce((s, m) => s + m.total, 0);
                        const pct = total > 0 ? ` (${((v / total) * 100).toFixed(1)}% of 6-month total)` : "";
                        return [`${formatFullINR(v)}${pct}`, "Income"];
                      }}
                      labelFormatter={formatMonthKey}
                    />
                    <Bar dataKey="total" fill="#6f16d9" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {combinedForecast.length > 0 && (
                <div className="panel-card">
                  <h2 className="text-sm font-semibold mb-1">6-Month Forecast</h2>
                  <p className="text-xs text-muted-foreground mb-4">Projected income and expense trend based on your recurring records</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={combinedForecast}>
                      <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
                      <Tooltip content={<ForecastTooltip />} cursor={false} />
                      <Legend />
                      <Bar dataKey="projectedExpenses" fill="#f97316" radius={[8, 8, 0, 0]} name="Projected Expenses" />
                      <Bar dataKey="projectedIncome" fill="#10b981" radius={[8, 8, 0, 0]} name="Projected Income" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {summary?.sourceBreakdown?.length > 0 && (
                <div className="panel-card">
                  <h2 className="text-sm font-semibold mb-4">Income by Source</h2>
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie
                        data={summary.sourceBreakdown}
                        dataKey="total"
                        nameKey="source"
                        cx="50%"
                        cy="50%"
                        outerRadius={82}
                        innerRadius={44}
                        paddingAngle={3}
                      >
                        {summary.sourceBreakdown.map((entry) => (
                          <Cell
                            key={entry.source}
                            fill={entry.source === "Salary" ? "#6f16d9" : SOURCE_COLORS[entry.source] || "#6b7280"}
                          />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip
                        cursor={false}
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

      <div className="panel-card">
        <h2 className="text-sm font-semibold mb-4">Other Income Entries</h2>
        {!hasData || entries.length === 0 ? (
          <div className="dashboard-empty-state dashboard-empty-state-compact">
            <div className="dashboard-empty-icon dashboard-empty-icon-sky">+</div>
            <p className="dashboard-empty-title">No other income entries yet</p>
            <p className="dashboard-empty-copy">New side income entries will show up here once you add them.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm dashboard-data-table">
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
                          {new Date(entry.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className="rounded border border-border px-2 py-1 text-xs bg-background"
                            value={editForm.source}
                            onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}
                          >
                            {NON_SALARY_SOURCES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            className="rounded border border-border px-2 py-1 text-xs w-24 bg-background"
                            value={editForm.amount}
                            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className="rounded border border-border px-2 py-1 text-xs bg-background"
                            value={editForm.frequency}
                            onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value })}
                          >
                            {Object.keys(FREQ_LABELS).map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="text"
                            className="rounded border border-border px-2 py-1 text-xs w-28 bg-background"
                            value={editForm.note}
                            onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-4 flex gap-2">
                          <button onClick={() => handleEditSave(entry._id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground">
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {new Date(entry.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${SOURCE_COLORS[entry.source] || "#6b7280"}20`,
                              color: SOURCE_COLORS[entry.source] || "#6b7280",
                            }}
                          >
                            {entry.source}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-semibold">{formatFullINR(entry.amount)}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground text-xs">{entry.frequency}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground max-w-[140px] truncate">{entry.note || "-"}</td>
                        <td className="py-2.5 pr-4 flex gap-3">
                          <button onClick={() => handleEdit(entry)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(entry._id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                            Delete
                          </button>
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

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const income = payload.find((item) => item.dataKey === "projectedIncome")?.value || 0;
  const expenses = payload.find((item) => item.dataKey === "projectedExpenses")?.value || 0;

  return (
    <div className="dashboard-chart-tooltip">
      <p className="dashboard-chart-tooltip-label">{formatMonthKey(label)}</p>
      <div className="dashboard-chart-tooltip-row">
        <span>Projected Income</span>
        <strong>{formatFullINR(income)}</strong>
      </div>
      <div className="dashboard-chart-tooltip-row">
        <span>Projected Expenses</span>
        <strong>{formatFullINR(expenses)}</strong>
      </div>
      <p className="dashboard-chart-tooltip-meta">
        Net projection: {formatFullINR(income - expenses)}
      </p>
    </div>
  );
}

function SummaryCard({ label, value, color, sub }) {
  const colors = {
    blue: "dashboard-stat-card dashboard-stat-card-blue",
    violet: "dashboard-stat-card dashboard-stat-card-violet",
  };

  return (
    <div className={colors[color]}>
      <p className="dashboard-stat-label">{label}</p>
      <p className="dashboard-stat-value">{value}</p>
      {sub && <p className="dashboard-stat-subtext">{sub}</p>}
    </div>
  );
}
