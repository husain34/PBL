import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

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
function daysUntil(deadline) {
  return Math.max(0, Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24)));
}
function projectedCompletion(goal) {
  const remaining = goal.targetAmount - goal.currentProgress;
  if (remaining <= 0) return "Completed";
  const daysSince = Math.max(1, Math.ceil((new Date() - new Date(goal.createdAt)) / (1000 * 60 * 60 * 24)));
  const rate = goal.currentProgress / daysSince;
  if (rate <= 0) return "No allocation yet";
  const projected = new Date();
  projected.setDate(projected.getDate() + Math.ceil(remaining / rate));
  return projected.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const PRIORITY_COLORS = {
  High: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-600" },
  Medium: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-600" },
  Low: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-600" },
};
const GOAL_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];
const EMPTY_FORM = { name: "", targetAmount: "", deadline: "", priority: "Medium", color: "#3b82f6" };

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [allocationHistory, setAllocationHistory] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [allocations, setAllocations] = useState({});
  const [editingAllocation, setEditingAllocation] = useState(null);
  const [newProgress, setNewProgress] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchGoals = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/goals`, { headers });
      setGoals(res.data.goals);
      setTotalBalance(res.data.totalBalance);
      setAllocationHistory(res.data.allocationHistory || []);
    } catch { setError("Failed to load goals."); }
  }, []);

  useEffect(() => { 
    fetchGoals();
    const handleFocus = () => fetchGoals();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchGoals]);

  const handleAddGoal = async () => {
    if (!form.name || !form.targetAmount || !form.deadline) { setError("Fill in all required fields."); return; }
    setSubmitting(true); setError(""); setSuccess("");
    try {
      await axios.post(`${API}/goals`, form, { headers });
      setSuccess("Goal created!"); setForm(EMPTY_FORM); setShowForm(false);
      await fetchGoals(); setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed to create goal."); }
    finally { setSubmitting(false); }
  };

  const handleAllocate = async (goalId) => {
    const amount = Number(allocations[goalId]);
    if (!amount || amount <= 0) { setError("Enter a valid amount."); return; }
    setError(""); setSuccess("");
    try {
      const res = await axios.post(`${API}/goals/${goalId}/allocate`, { amount }, { headers });
      setTotalBalance(res.data.totalBalance);
      setAllocations((prev) => ({ ...prev, [goalId]: "" }));
      setSuccess("Amount allocated!"); await fetchGoals(); setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Allocation failed."); }
  };

  const handleEditAllocation = async (goalId) => {
    if (newProgress === "" || Number(newProgress) < 0) { setError("Enter a valid progress amount."); return; }
    setError("");
    try {
      const res = await axios.put(`${API}/goals/${goalId}/allocation`, { newProgress: Number(newProgress) }, { headers });
      setTotalBalance(res.data.totalBalance);
      setEditingAllocation(null); setNewProgress("");
      setSuccess("Allocation updated!"); await fetchGoals(); setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed to update allocation."); }
  };

  const handleDeleteGoal = async (id) => {
    try { await axios.delete(`${API}/goals/${id}`, { headers }); await fetchGoals(); }
    catch { setError("Failed to delete goal."); }
  };

  const activeGoals = goals.filter((g) => g.currentProgress < g.targetAmount);
  const completedGoals = goals.filter((g) => g.currentProgress >= g.targetAmount);

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10 max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Goals</h1>
          <p className="text-muted-foreground mt-1 text-sm">Set targets and allocate savings toward them.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
          + New Goal
        </button>
      </div>

      {/* Total Balance */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-1">Total Balance</p>
          <p className="text-3xl font-bold text-emerald-700">{formatFullINR(totalBalance)}</p>
          <p className="text-xs text-emerald-600 mt-1">Available to allocate toward goals</p>
        </div>
      </div>

      {/* Goal Allocation Chart */}
      {allocationHistory.some((m) => m.allocated > 0) && (
        <div className="auth-card">
          <h2 className="text-sm font-semibold mb-4">Goal Allocations — Last 6 Months</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={allocationHistory}>
              <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v) => {
                  const total = allocationHistory.reduce((s, m) => s + m.allocated, 0);
                  const pct = total > 0 ? ` (${((v / total) * 100).toFixed(1)}% of 6-month total)` : "";
                  return [`${formatFullINR(v)}${pct}`, "Allocated"];
                }}
                labelFormatter={formatMonthKey}
              />
              <Bar dataKey="allocated" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Allocated to Goals" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* New Goal Form */}
      {showForm && (
        <div className="auth-card max-w-lg space-y-4">
          <h2 className="text-base font-semibold">Create New Goal</h2>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Goal Name</label>
            <input type="text"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Emergency Fund" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target Amount (₹)</label>
              <input type="number" min="0"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 100000" value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deadline</label>
              <input type="date"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority</label>
            <div className="flex gap-2">
              {["High", "Medium", "Low"].map((p) => (
                <button key={p} onClick={() => setForm({ ...form, priority: p })}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    form.priority === p ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-blue-300"
                  }`}>{p}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Color</label>
            <div className="flex gap-2">
              {GOAL_COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === c ? "ring-2 ring-offset-2 ring-gray-400" : ""}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}
          <button onClick={handleAddGoal} disabled={submitting}
            className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
              submitting ? "bg-secondary text-muted-foreground cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}>{submitting ? "Creating..." : "Create Goal"}</button>
        </div>
      )}

      {error && !showForm && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-lg">{error}</p>}
      {success && !showForm && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 max-w-lg">{success}</p>}

      {/* Active Goals */}
      {activeGoals.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Active Goals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeGoals.map((goal) => {
              const pct = Math.min(100, (goal.currentProgress / goal.targetAmount) * 100);
              const p = PRIORITY_COLORS[goal.priority];
              return (
                <div key={goal._id} className={`rounded-2xl border p-5 space-y-4 ${p.bg} ${p.border}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-bold text-base ${p.text}`}>{goal.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.badge}`}>{goal.priority}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {daysUntil(goal.deadline)} days left · Due {new Date(goal.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteGoal(goal._id)} className="text-xs text-muted-foreground hover:text-red-500">×</button>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className={`font-semibold ${p.text}`}>{formatFullINR(goal.currentProgress)}</span>
                      <span className="text-muted-foreground">{formatFullINR(goal.targetAmount)}</span>
                    </div>
                    <div className="w-full h-2.5 bg-white/60 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: goal.color }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{pct.toFixed(1)}% complete</p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Projected completion: <span className="font-medium text-foreground">{projectedCompletion(goal)}</span>
                  </p>

                  {/* Allocate */}
                  <div className="flex gap-2">
                    <input type="number" min="0"
                      className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Allocate ₹"
                      value={allocations[goal._id] || ""}
                      onChange={(e) => setAllocations((prev) => ({ ...prev, [goal._id]: e.target.value }))} />
                    <button onClick={() => handleAllocate(goal._id)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap">
                      Allocate
                    </button>
                  </div>

                  {/* Edit allocation */}
                  {editingAllocation === goal._id ? (
                    <div className="flex gap-2 items-center">
                      <input type="number" min="0"
                        className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Set total progress to ₹"
                        value={newProgress}
                        onChange={(e) => setNewProgress(e.target.value)} />
                      <button onClick={() => handleEditAllocation(goal._id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors">
                        Set
                      </button>
                      <button onClick={() => { setEditingAllocation(null); setNewProgress(""); }}
                        className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingAllocation(goal._id); setNewProgress(goal.currentProgress); }}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                      Correct allocation
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-muted-foreground">Completed Goals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completedGoals.map((goal) => (
              <div key={goal._id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">{goal.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Completed</span>
                  </div>
                  <button onClick={() => handleDeleteGoal(goal._id)} className="text-xs text-muted-foreground hover:text-red-500">×</button>
                </div>
                <div className="w-full h-2 bg-emerald-200 rounded-full">
                  <div className="h-full rounded-full bg-emerald-500 w-full" />
                </div>
                <p className="text-sm font-semibold text-emerald-700">{formatFullINR(goal.targetAmount)} reached</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {goals.length === 0 && (
        <div className="auth-card flex flex-col items-center justify-center py-16 text-center space-y-3">
          <p className="text-base font-semibold">No goals yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">Create your first financial goal and start allocating from your total balance.</p>
        </div>
      )}
    </div>
  );
}