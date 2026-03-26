const express = require("express");
const jwt = require("jsonwebtoken");
const Goal = require("../models/Goal");
const GoalAllocation = require("../models/GoalAllocation");
const User = require("../models/User");

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

// GET /api/goals — includes 6-month allocation history
router.get("/", authMiddleware, async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.userId }).sort({ priority: 1, createdAt: -1 });
    const user = await User.findById(req.userId).select("totalBalance");

    // 6-month allocation history for chart
    const allocationHistory = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const allocs = await GoalAllocation.find({
        userId: req.userId,
        date: { $gte: start, $lte: end },
      });
      allocationHistory.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        allocated: allocs.reduce((s, a) => s + a.amount, 0),
      });
    }

    res.json({ goals, totalBalance: user?.totalBalance || 0, allocationHistory });
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
    const goal = await Goal.create({
      userId: req.userId, name,
      targetAmount: Number(targetAmount),
      deadline, priority: priority || "Medium",
      color: color || "#3b82f6",
    });
    res.status(201).json(goal);
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
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.totalBalance < Number(amount))
      return res.status(400).json({ message: "Insufficient total balance" });

    const goal = await Goal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found" });

    const remaining = goal.targetAmount - goal.currentProgress;
    const toAdd = Math.min(Number(amount), remaining);

    goal.currentProgress += toAdd;
    user.totalBalance -= toAdd;

    await GoalAllocation.create({
      userId: req.userId, goalId: goal._id,
      amount: toAdd, date: new Date(),
    });

    await Promise.all([goal.save(), user.save()]);
    res.json({ goal, totalBalance: user.totalBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/goals/:id/allocation — update/correct total allocation for a goal
// Adjusts total balance by the diff
router.put("/:id/allocation", authMiddleware, async (req, res) => {
  const { newProgress } = req.body;
  if (newProgress === undefined || Number(newProgress) < 0)
    return res.status(400).json({ message: "Invalid progress amount" });
  try {
    const goal = await Goal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found" });

    const user = await User.findById(req.userId);
    const diff = Number(newProgress) - goal.currentProgress;

    // If increasing: check balance
    if (diff > 0 && (user.totalBalance || 0) < diff)
      return res.status(400).json({ message: "Insufficient total balance" });

    // If decreasing: refund to balance
    goal.currentProgress = Math.min(Number(newProgress), goal.targetAmount);
    user.totalBalance = Math.max(0, (user.totalBalance || 0) - diff);

    if (diff !== 0) {
      await GoalAllocation.create({
        userId: req.userId, goalId: goal._id,
        amount: diff, date: new Date(),
      });
    }

    await Promise.all([goal.save(), user.save()]);
    res.json({ goal, totalBalance: user.totalBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/goals/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const goal = await Goal.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found" });
    await GoalAllocation.deleteMany({ goalId: req.params.id });
    
    // Refund the allocated amount back to user's total balance
    const user = await User.findById(req.userId);
    if (user) {
      user.totalBalance = (user.totalBalance || 0) + goal.currentProgress;
      await user.save();
    }
    
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;