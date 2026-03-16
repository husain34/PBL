const express = require("express");
const jwt = require("jsonwebtoken");
const Goal = require("../models/Goal");
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

// GET /api/goals
router.get("/", authMiddleware, async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.userId }).sort({ priority: 1, createdAt: -1 });
    const user = await User.findById(req.userId).select("savingsPot");
    res.json({ goals, savingsPot: user?.savingsPot || 0 });
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
      userId: req.userId,
      name,
      targetAmount: Number(targetAmount),
      deadline,
      priority: priority || "Medium",
      color: color || "#3b82f6",
    });
    res.status(201).json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/goals/:id/allocate — deduct from savings pot and add to goal
router.post("/:id/allocate", authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0)
    return res.status(400).json({ message: "Invalid amount" });

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.savingsPot < Number(amount))
      return res.status(400).json({ message: "Insufficient savings pot balance" });

    const goal = await Goal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found" });

    const remaining = goal.targetAmount - goal.currentProgress;
    const toAdd = Math.min(Number(amount), remaining);

    goal.currentProgress += toAdd;
    user.savingsPot -= toAdd;

    await Promise.all([goal.save(), user.save()]);

    res.json({ goal, savingsPot: user.savingsPot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/goals/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const goal = await Goal.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
