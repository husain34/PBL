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

// POST /api/income
router.post("/", authMiddleware, async (req, res) => {
  const { amount, source, frequency, date, note } = req.body;
  if (!amount || !source || !frequency || !date)
    return res.status(400).json({ message: "Missing required fields" });
  try {
    const entryDate = new Date(date);
    const monthStart = new Date(entryDate.getFullYear(), entryDate.getMonth(), 1);
    const monthEnd = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0, 23, 59, 59);

    // If source is Salary, replace existing salary entry for that month
    if (source === "Salary") {
      const existing = await Income.findOne({
        userId: req.userId,
        source: "Salary",
        date: { $gte: monthStart, $lte: monthEnd },
      });

      if (existing) {
        const diff = Number(amount) - existing.amount;
        existing.amount = Number(amount);
        existing.date = entryDate;
        existing.note = note || "";
        existing.frequency = frequency;
        await existing.save();

        // Adjust savings pot by the difference
        await User.findByIdAndUpdate(req.userId, {
          $inc: { savingsPot: diff },
        });

        return res.status(200).json(existing);
      }
    }

    // For all other sources (or new salary with no existing entry), create normally
    const entry = await Income.create({
      userId: req.userId,
      amount: Number(amount),
      source,
      frequency,
      date: entryDate,
      note: note || "",
    });

    await User.findByIdAndUpdate(req.userId, {
      $inc: { savingsPot: Number(amount) },
    });

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/income
router.get("/", authMiddleware, async (req, res) => {
  try {
    const entries = await Income.find({ userId: req.userId }).sort({ date: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/income/summary
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const thisMonthEntries = await Income.find({
      userId: req.userId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
    });
    const thisMonthTotal = thisMonthEntries.reduce((s, e) => s + e.amount, 0);

    // Projected annual: only use recurring/monthly entries, exclude one-time
    const recurringEntries = thisMonthEntries.filter((e) => e.frequency !== "One-time");
    const recurringMonthlyTotal = recurringEntries.reduce((s, e) => {
      if (e.frequency === "Weekly") return s + e.amount * 4;
      return s + e.amount; // Monthly
    }, 0);
    const projectedAnnual = recurringMonthlyTotal * 12;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const allEntries = await Income.find({
      userId: req.userId,
      date: { $gte: sixMonthsAgo },
    });

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

    const allUserEntries = await Income.find({ userId: req.userId });
    const sourceMap = {};
    allUserEntries.forEach((e) => {
      sourceMap[e.source] = (sourceMap[e.source] || 0) + e.amount;
    });
    const sourceBreakdown = Object.entries(sourceMap).map(([source, total]) => ({ source, total }));
    const distinctSources = [...new Set(allUserEntries.map((e) => e.source))].length;

    const user = await User.findById(req.userId).select("savingsPot profileAnswers");
    const profileIncome = user?.profileAnswers?.monthlyIncome || null;
    const savingsPot = user?.savingsPot || 0;

    res.json({
      thisMonthTotal,
      projectedAnnual,
      distinctSources,
      monthlyChart,
      sourceBreakdown,
      profileIncome,
      savingsPot,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/income/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const entry = await Income.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!entry) return res.status(404).json({ message: "Entry not found" });

    const user = await User.findById(req.userId);
    user.savingsPot = Math.max(0, (user.savingsPot || 0) - entry.amount);
    await user.save();

    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;