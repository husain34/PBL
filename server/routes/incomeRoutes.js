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

// POST /api/income — add new income (non-salary only)
// Blocks future-dated entries and salary source
router.post("/", authMiddleware, async (req, res) => {
  const { amount, source, frequency, date, note } = req.body;
  if (!amount || !source || !frequency || !date)
    return res.status(400).json({ message: "Missing required fields" });
  if (source === "Salary")
    return res.status(400).json({ message: "Use the salary endpoint to manage salary" });

  const entryDate = new Date(date);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (entryDate > today)
    return res.status(400).json({ message: "Cannot log income for a future date" });

  try {
    const entry = await Income.create({
      userId: req.userId,
      amount: Number(amount),
      source,
      frequency,
      date: entryDate,
      note: note || "",
    });
    await User.findByIdAndUpdate(req.userId, { $inc: { totalBalance: Number(amount) } });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/income/salary — create or update salary for a specific month
router.put("/salary", authMiddleware, async (req, res) => {
  const { amount, note, month } = req.body;
  if (!amount || Number(amount) <= 0)
    return res.status(400).json({ message: "Valid amount required" });

  try {
    const now = new Date();
    let monthStart, monthEnd;
    
    if (month) {
      const [year, monthNum] = month.split("-");
      monthStart = new Date(Number(year), Number(monthNum) - 1, 1);
      monthEnd = new Date(Number(year), Number(monthNum), 0, 23, 59, 59);
    } else {
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const existing = await Income.findOne({
      userId: req.userId,
      source: "Salary",
      date: { $gte: monthStart, $lte: monthEnd },
    });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (existing) {
      const diff = Number(amount) - existing.amount;
      existing.amount = Number(amount);
      existing.note = note || existing.note;
      await existing.save();
      user.totalBalance = Math.max(0, (user.totalBalance || 0) + diff);
      await user.save();
      return res.json({ entry: existing, totalBalance: user.totalBalance, updated: true });
    }

    const [year, monthNum] = (month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).split("-");
    const entry = await Income.create({
      userId: req.userId,
      amount: Number(amount),
      source: "Salary",
      frequency: "Monthly",
      date: new Date(Number(year), Number(monthNum) - 1, 1),
      note: note || "",
    });
    user.totalBalance = (user.totalBalance || 0) + Number(amount);
    await user.save();
    res.status(201).json({ entry, totalBalance: user.totalBalance, updated: false });
  } catch (err) {
    console.error("Salary update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/income/salary — get salary entry for a specific month
router.get("/salary", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const { month } = req.query;
    let monthStart, monthEnd;
    
    if (month) {
      const [year, monthNum] = month.split("-");
      monthStart = new Date(Number(year), Number(monthNum) - 1, 1);
      monthEnd = new Date(Number(year), Number(monthNum), 0, 23, 59, 59);
    } else {
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
    
    const entry = await Income.findOne({
      userId: req.userId,
      source: "Salary",
      date: { $gte: monthStart, $lte: monthEnd },
    });
    res.json({ entry: entry || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/income/:id — edit a non-salary income entry
router.put("/:id", authMiddleware, async (req, res) => {
  const { amount, source, frequency, note } = req.body;
  if (source === "Salary")
    return res.status(400).json({ message: "Use the salary endpoint to manage salary" });
  try {
    const entry = await Income.findOne({ _id: req.params.id, userId: req.userId });
    if (!entry) return res.status(404).json({ message: "Entry not found" });

    const diff = Number(amount) - entry.amount;
    entry.amount = Number(amount) || entry.amount;
    entry.source = source || entry.source;
    entry.frequency = frequency || entry.frequency;
    entry.note = note ?? entry.note;
    await entry.save();

    await User.findByIdAndUpdate(req.userId, { $inc: { totalBalance: diff } });
    res.json(entry);
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

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const allEntries = await Income.find({ userId: req.userId, date: { $gte: sixMonthsAgo } });

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

    // 6-month forecast: recurring/salary entries projected forward
    const forecast = [];
    const salaryEntry = thisMonthEntries.find((e) => e.source === "Salary");
    const recurringEntries = await Income.find({
      userId: req.userId,
      frequency: "Monthly",
      date: { $gte: startOfMonth, $lte: endOfMonth },
    });
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const projected = recurringEntries.reduce((s, e) => s + e.amount, 0);
      forecast.push({ month: key, projected });
    }

    const user = await User.findById(req.userId).select("totalBalance profileAnswers");
    const profileIncome = user?.profileAnswers?.monthlyIncome || null;
    const totalBalance = user?.totalBalance || 0;

    res.json({
      thisMonthTotal,
      monthlyChart,
      sourceBreakdown,
      profileIncome,
      totalBalance,
      forecast,
      currentSalary: salaryEntry ? salaryEntry.amount : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/income/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const entry = await Income.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    const user = await User.findById(req.userId);
    user.totalBalance = Math.max(0, (user.totalBalance || 0) - entry.amount);
    await user.save();
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;