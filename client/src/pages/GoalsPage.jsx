import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = "http://localhost:5000/api";

function formatFullINR(v) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
}
function formatINR(v) {
  if (v >= 100000) return `INR ${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `INR ${(v / 1000).toFixed(1)}k`;
  return `INR ${v}`;
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
  const [celebration, setCelebration] = useState(null);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchGoals = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/goals`, { headers });
      setGoals(res.data.goals);
      setTotalBalance(res.data.totalBalance);
      setAllocationHistory(res.data.allocationHistory || []);
    } catch {
      setError("Failed to load goals.");
    }
  }, []);

  useEffect(() => {
    fetchGoals();
    const handleFocus = () => fetchGoals();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchGoals]);

  const handleAddGoal = async () => {
    if (!form.name || !form.targetAmount || !form.deadline) {
      setError("Fill in all required fields.");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await axios.post(`${API}/goals`, form, { headers });
      setSuccess("Goal created!");
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchGoals();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create goal.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAllocate = async (goal) => {
    const amount = Number(allocations[goal._id]);
    if (!amount || amount <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      const res = await axios.post(`${API}/goals/${goal._id}/allocate`, { amount }, { headers });
      const previousPct = (goal.currentProgress / goal.targetAmount) * 100;
      const nextPct = ((goal.currentProgress + amount) / goal.targetAmount) * 100;
      const crossedMilestone = [25, 50, 75, 100].find((milestone) => previousPct < milestone && nextPct >= milestone);

      if (crossedMilestone) {
        setCelebration({ goalName: goal.name, milestone: crossedMilestone });
        setTimeout(() => setCelebration(null), 2800);
      }

      setTotalBalance(res.data.totalBalance);
      setAllocations((prev) => ({ ...prev, [goal._id]: "" }));
      setSuccess("Amount allocated!");
      await fetchGoals();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Allocation failed.");
    }
  };

  const handleEditAllocation = async (goalId) => {
    if (newProgress === "" || Number(newProgress) < 0) {
      setError("Enter a valid progress amount.");
      return;
    }
    setError("");
    try {
      const res = await axios.put(`${API}/goals/${goalId}/allocation`, { newProgress: Number(newProgress) }, { headers });
      setTotalBalance(res.data.totalBalance);
      setEditingAllocation(null);
      setNewProgress("");
      setSuccess("Allocation updated!");
      await fetchGoals();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update allocation.");
    }
  };

  const handleDeleteGoal = async (id) => {
    try {
      await axios.delete(`${API}/goals/${id}`, { headers });
      await fetchGoals();
    } catch {
      setError("Failed to delete goal.");
    }
  };

  const activeGoals = goals.filter((g) => g.currentProgress < g.targetAmount);
  const completedGoals = goals.filter((g) => g.currentProgress >= g.targetAmount);
  const nearestDeadline = activeGoals.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];

  return (
    <div className="dashboard-shell space-y-8">
      <section className="dashboard-page-header flex items-start justify-between gap-4">
        <div>
          <p className="dashboard-eyebrow">Goals Center</p>
          <h1 className="dashboard-title dashboard-page-title">Goals</h1>
          <p className="dashboard-subtitle">Create targets, allocate available balance, and see progress move toward deadlines in a cleaner planning view.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="dashboard-primary-button">
          + New Goal
        </button>
      </section>

      <div className="dashboard-balance-card">
        <div>
          <p className="dashboard-balance-label">Goal Funding Status</p>
          <p className="dashboard-balance-value">{formatFullINR(totalBalance)}</p>
          <p className="dashboard-balance-copy">Available to allocate toward your active goals right now.</p>
        </div>
        <div className="dashboard-balance-meta">
          <div className="dashboard-balance-chip">
            <span>Active Goals</span>
            <strong>{activeGoals.length}</strong>
          </div>
          <div className="dashboard-balance-chip dashboard-balance-chip-muted">
            <span>Nearest Deadline</span>
            <strong>{nearestDeadline ? `${daysUntil(nearestDeadline.deadline)} days` : "No pending goal"}</strong>
          </div>
        </div>
      </div>

      {celebration && (
        <div className="dashboard-toast">
          <div className="dashboard-toast-burst" />
          <div>
            <p className="dashboard-toast-title">Great job!</p>
            <p className="dashboard-toast-copy">{celebration.goalName} just crossed the {celebration.milestone}% milestone.</p>
          </div>
        </div>
      )}

      {allocationHistory.some((m) => m.allocated > 0) && (
        <div className="panel-card">
          <h2 className="text-sm font-semibold mb-4">Goal Allocations - Last 6 Months</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={allocationHistory}>
              <XAxis dataKey="month" tickFormatter={formatMonthKey} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatINR} tick={{ fontSize: 11 }} />
              <Tooltip content={<AllocationTooltip history={allocationHistory} />} cursor={false} />
              <Bar dataKey="allocated" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Allocated to Goals" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {showForm && (
        <div className="panel-card max-w-lg space-y-4">
          <h2 className="text-base font-semibold">Create New Goal</h2>
          <div className="space-y-1">
            <label className="dashboard-field-label">Goal Name</label>
            <input
              type="text"
              className="dashboard-input"
              placeholder="e.g. Emergency Fund"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="dashboard-field-label">Target Amount (INR)</label>
              <input
                type="number"
                min="0"
                className="dashboard-input"
                placeholder="e.g. 100000"
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="dashboard-field-label">Deadline</label>
              <input
                type="date"
                className="dashboard-input"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="dashboard-field-label">Priority</label>
            <div className="flex gap-2">
              {["High", "Medium", "Low"].map((p) => (
                <button
                  key={p}
                  onClick={() => setForm({ ...form, priority: p })}
                  className={`dashboard-toggle-button flex-1 ${form.priority === p ? "dashboard-toggle-button-active" : ""}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="dashboard-field-label">Color</label>
            <div className="flex gap-2">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === c ? "ring-2 ring-offset-2 ring-gray-400" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}
          <button
            onClick={handleAddGoal}
            disabled={submitting}
            className={`dashboard-primary-button w-full ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {submitting ? "Creating..." : "Create Goal"}
          </button>
        </div>
      )}

      {error && !showForm && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-lg">{error}</p>}
      {success && !showForm && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 max-w-lg">{success}</p>}

      {activeGoals.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Active Goals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeGoals.map((goal) => {
              const pct = Math.min(100, (goal.currentProgress / goal.targetAmount) * 100);
              const p = PRIORITY_COLORS[goal.priority];
              const urgency = getUrgency(goal);

              return (
                <div key={goal._id} className={`panel-card space-y-4 ${p.bg} ${p.border}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-bold text-base ${p.text}`}>{goal.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.badge}`}>{goal.priority}</span>
                      </div>
                      <p className={`text-xs ${urgency.copyClass}`}>
                        {daysUntil(goal.deadline)} days left - Due{" "}
                        {new Date(goal.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteGoal(goal._id)} className="text-xs text-muted-foreground hover:text-red-500">
                      x
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className={`font-semibold ${p.text}`}>{formatFullINR(goal.currentProgress)}</span>
                      <span className="text-muted-foreground">{formatFullINR(goal.targetAmount)}</span>
                    </div>
                    <div className="dashboard-goal-progress">
                      <div className="w-full h-2.5 bg-white/60 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: urgency.barColor }} />
                      </div>
                      {[25, 50, 75].map((milestone) => (
                        <span
                          key={milestone}
                          className={`dashboard-goal-milestone ${pct >= milestone ? "dashboard-goal-milestone-complete" : ""}`}
                          style={{ left: `${milestone}%` }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-1">
                      <p className="text-xs text-muted-foreground">{pct.toFixed(1)}% complete</p>
                      <p className={`text-xs font-semibold ${urgency.copyClass}`}>{urgency.label}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Projected completion: <span className="font-medium text-foreground">{projectedCompletion(goal)}</span>
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      className="dashboard-input flex-1"
                      placeholder="Allocate INR"
                      value={allocations[goal._id] || ""}
                      onChange={(e) => setAllocations((prev) => ({ ...prev, [goal._id]: e.target.value }))}
                    />
                    <button onClick={() => handleAllocate(goal)} className="dashboard-primary-button whitespace-nowrap">
                      Allocate
                    </button>
                  </div>

                  {editingAllocation === goal._id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        min="0"
                        className="dashboard-input flex-1"
                        placeholder="Set total progress to INR"
                        value={newProgress}
                        onChange={(e) => setNewProgress(e.target.value)}
                      />
                      <button onClick={() => handleEditAllocation(goal._id)} className="dashboard-primary-button">
                        Set
                      </button>
                      <button onClick={() => { setEditingAllocation(null); setNewProgress(""); }} className="text-xs text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingAllocation(goal._id); setNewProgress(goal.currentProgress); }}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      Correct allocation
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completedGoals.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-muted-foreground">Completed Goals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completedGoals.map((goal) => (
              <div key={goal._id} className="panel-card border-emerald-200 bg-emerald-50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">{goal.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Completed</span>
                  </div>
                  <button onClick={() => handleDeleteGoal(goal._id)} className="text-xs text-muted-foreground hover:text-red-500">
                    x
                  </button>
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
        <div className="panel-card">
          <div className="dashboard-empty-state">
            <div className="dashboard-empty-icon dashboard-empty-icon-emerald">GO</div>
            <p className="dashboard-empty-title">No goals yet</p>
            <p className="dashboard-empty-copy">Create your first financial goal and start allocating from your total balance.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function getUrgency(goal) {
  const progress = (goal.currentProgress / goal.targetAmount) * 100;
  const daysLeft = daysUntil(goal.deadline);

  if (daysLeft <= 30 && progress < 60) {
    return {
      label: "Needs attention soon",
      barColor: "#f59e0b",
      copyClass: "text-amber-700",
    };
  }

  if (progress >= 75) {
    return {
      label: "Strong progress",
      barColor: goal.color,
      copyClass: "text-emerald-700",
    };
  }

  return {
    label: "On track",
    barColor: goal.color,
    copyClass: "text-muted-foreground",
  };
}

function AllocationTooltip({ active, payload, label, history }) {
  if (!active || !payload?.length) return null;
  const total = history.reduce((sum, item) => sum + item.allocated, 0);
  const value = payload[0]?.value || 0;
  const share = total > 0 ? `${((value / total) * 100).toFixed(1)}% of 6-month total` : "No recent allocation";

  return (
    <div className="dashboard-chart-tooltip">
      <p className="dashboard-chart-tooltip-label">{formatMonthKey(label)}</p>
      <div className="dashboard-chart-tooltip-row">
        <span>Allocated</span>
        <strong>{formatFullINR(value)}</strong>
      </div>
      <p className="dashboard-chart-tooltip-meta">{share}</p>
    </div>
  );
}
