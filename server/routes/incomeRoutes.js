const express = require("express");
const jwt = require("jsonwebtoken");
const Income = require("../models/Income");
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

// POST /api/income — add new income entry
router.post("/", authMiddleware, async (req, res) => {
  const { amount, source, frequency, date, note } = req.body;
  if (!amount || !source || !frequency || !date)
    return res.status(400).json({ message: "Missing required fields" });
  try {
    const entry = await Income.create({
      userId: req.userId,
      amount,
      source,
      frequency,
      date,
      note: note || "",
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/income — fetch all income entries for user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const entries = await Income.find({ userId: req.userId }).sort({ date: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/income/summary — aggregated stats
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // This month's income
    const thisMonthEntries = await Income.find({
      userId: req.userId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
    });
    const thisMonthTotal = thisMonthEntries.reduce((s, e) => s + e.amount, 0);

    // All entries for monthly chart (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const allEntries = await Income.find({
      userId: req.userId,
      date: { $gte: sixMonthsAgo },
    });

    // Build month-by-month totals
    const monthMap = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap[key] = { month: key, total: 0 };
    }
    allEntries.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthMap[key]) monthMap[key].total += e.amount;
    });
    const monthlyChart = Object.values(monthMap);

    // Source breakdown (all time)
    const allUserEntries = await Income.find({ userId: req.userId });
    const sourceMap = {};
    allUserEntries.forEach((e) => {
      sourceMap[e.source] = (sourceMap[e.source] || 0) + e.amount;
    });
    const sourceBreakdown = Object.entries(sourceMap).map(([source, total]) => ({
      source,
      total,
    }));

    // Distinct source count
    const distinctSources = [...new Set(allUserEntries.map((e) => e.source))].length;

    // Projected annual (this month × 12)
    const projectedAnnual = thisMonthTotal * 12;

    // User's declared income target from profile
    const user = await User.findById(req.userId).select("monthlyIncomeTarget profileAnswers");
    const declaredIncome = user?.monthlyIncomeTarget || null;
    const profileIncome = user?.profileAnswers?.monthlyIncome || null;

    res.json({
      thisMonthTotal,
      projectedAnnual,
      distinctSources,
      monthlyChart,
      sourceBreakdown,
      declaredIncome,
      profileIncome,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/income/:id — delete an entry
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const entry = await Income.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
