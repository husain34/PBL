const express = require("express");
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

const router = express.Router();

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function formatGoal(g) {
  if (!g) return null;
  return {
    ...g,
    _id: g.id,
    userId: g.user_id,
    targetAmount: g.target_amount,
    currentProgress: g.current_progress
  };
}

// GET /api/goals — includes 6-month allocation history
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { data: goalsRaw, error } = await supabase
        .from('goals')
        .select()
        .eq('user_id', req.userId)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });
    if (error) throw error;
    
    // Sort array by enum internally since DB order might group alphabetically
    const orderMap = { "High": 1, "Medium": 2, "Low": 3 };
    const goals = goalsRaw.map(formatGoal).sort((a, b) => (orderMap[a.priority] || 4) - (orderMap[b.priority] || 4));

    const { data: user } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();

    const allocationHistory = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      
      const { data: allocs } = await supabase
        .from('goal_allocations')
        .select('amount')
        .eq('user_id', req.userId)
        .gte('date', start)
        .lte('date', end);

      allocationHistory.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        allocated: (allocs || []).reduce((s, a) => s + a.amount, 0),
      });
    }

    res.json({ goals, totalBalance: user?.total_balance || 0, allocationHistory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/goals
router.post("/", authMiddleware, async (req, res) => {
  const { name, targetAmount, deadline, priority, color } = req.body;
  if (!name || !targetAmount || !deadline)
    return res.status(400).json({ message: "Missing required fields" });
  try {
    const { data: goal, error } = await supabase.from('goals').insert({
      user_id: req.userId,
      name,
      target_amount: Number(targetAmount),
      deadline,
      priority: priority || "Medium",
      color: color || "#3b82f6",
    }).select().single();
    if (error) throw error;
    res.status(201).json(formatGoal(goal));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/goals/:id/allocate
router.post("/:id/allocate", authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0)
    return res.status(400).json({ message: "Invalid amount" });
  try {
    const { data: user, error: uErr } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    if (uErr) return res.status(404).json({ message: "User not found" });
    if ((user.total_balance || 0) < Number(amount))
      return res.status(400).json({ message: "Insufficient total balance" });

    const { data: goal, error: gErr } = await supabase.from('goals').select().eq('id', req.params.id).eq('user_id', req.userId).single();
    if (gErr) return res.status(404).json({ message: "Goal not found" });

    const remaining = goal.target_amount - goal.current_progress;
    const toAdd = Math.min(Number(amount), remaining);

    const newProgress = goal.current_progress + toAdd;
    const newBalance = user.total_balance - toAdd;

    await supabase.from('goal_allocations').insert({
      user_id: req.userId,
      goal_id: goal.id,
      amount: toAdd,
      date: new Date().toISOString()
    });

    const { data: updatedGoal } = await supabase.from('goals').update({ current_progress: newProgress }).eq('id', goal.id).select().single();
    await supabase.from('users').update({ total_balance: newBalance }).eq('id', req.userId);

    res.json({ goal: formatGoal(updatedGoal), totalBalance: newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/goals/:id/allocation
router.put("/:id/allocation", authMiddleware, async (req, res) => {
  const { newProgress } = req.body;
  if (newProgress === undefined || Number(newProgress) < 0)
    return res.status(400).json({ message: "Invalid progress amount" });
  try {
    const { data: goal, error: gErr } = await supabase.from('goals').select().eq('id', req.params.id).eq('user_id', req.userId).single();
    if (gErr) return res.status(404).json({ message: "Goal not found" });

    const { data: user, error: uErr } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    const diff = Number(newProgress) - goal.current_progress;

    if (diff > 0 && (user.total_balance || 0) < diff)
      return res.status(400).json({ message: "Insufficient total balance" });

    const updatedProgress = Math.min(Number(newProgress), goal.target_amount);
    const updatedBalance = Math.max(0, (user.total_balance || 0) - diff);

    if (diff !== 0) {
      await supabase.from('goal_allocations').insert({
        user_id: req.userId, goal_id: goal.id,
        amount: diff, date: new Date().toISOString()
      });
    }

    const { data: updatedGoal } = await supabase.from('goals').update({ current_progress: updatedProgress }).eq('id', goal.id).select().single();
    await supabase.from('users').update({ total_balance: updatedBalance }).eq('id', req.userId);

    res.json({ goal: formatGoal(updatedGoal), totalBalance: updatedBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/goals/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { data: goal, error: gErr } = await supabase.from('goals').select().eq('id', req.params.id).eq('user_id', req.userId).single();
    if (gErr || !goal) return res.status(404).json({ message: "Goal not found" });

    await supabase.from('goals').delete().eq('id', req.params.id);
    
    // cascade takes care of allocations
    const { data: user } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    if (user) {
      await supabase.from('users').update({ total_balance: (user.total_balance || 0) + goal.current_progress }).eq('id', req.userId);
    }
    
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;