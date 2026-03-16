const express = require("express");
const jwt = require("jsonwebtoken");
const Expense = require("../models/Expense");
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
 
// POST /api/expenses
router.post("/", authMiddleware, async (req, res) => {
  const { amount, categoryId, date, note, paymentMode, isRecurring } = req.body;
  if (!amount || !categoryId || !date)
    return res.status(400).json({ message: "Missing required fields" });
  try {
    const expense = await Expense.create({
      userId: req.userId,
      amount: Number(amount),
      categoryId,
      date,
      note: note || "",
      paymentMode: paymentMode || "UPI",
      isRecurring: isRecurring || false,
    });
    const populated = await expense.populate("categoryId", "name icon color");
 
    // Deduct from savings pot, floor at 0
    const user = await User.findById(req.userId);
    user.savingsPot = Math.max(0, (user.savingsPot || 0) - Number(amount));
    await user.save();
 
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// GET /api/expenses?month=YYYY-MM
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { month } = req.query;
    let filter = { userId: req.userId };
 
    if (month) {
      const [year, m] = month.split("-");
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 0, 23, 59, 59);
      filter.date = { $gte: start, $lte: end };
    }
 
    const expenses = await Expense.find(filter)
      .populate("categoryId", "name icon color type")
      .sort({ date: -1 });
 
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// DELETE /api/expenses/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!expense) return res.status(404).json({ message: "Not found" });
 
    // Add back to savings pot
    await User.findByIdAndUpdate(req.userId, {
      $inc: { savingsPot: expense.amount },
    });
 
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// GET /api/expenses/analytics
router.get("/analytics", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
 
    // Current month bounds
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
 
    // Previous month bounds
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
 
    const [thisMonthExpenses, prevMonthExpenses] = await Promise.all([
      Expense.find({ userId: req.userId, date: { $gte: thisStart, $lte: thisEnd } })
        .populate("categoryId", "name icon color type"),
      Expense.find({ userId: req.userId, date: { $gte: prevStart, $lte: prevEnd } })
        .populate("categoryId", "name icon color type"),
    ]);
 
    // Totals
    const thisTotal = thisMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const prevTotal = prevMonthExpenses.reduce((s, e) => s + e.amount, 0);
 
    // Category breakdown this month
    const categoryMap = {};
    thisMonthExpenses.forEach((e) => {
      const cat = e.categoryId;
      if (!cat) return;
      const key = cat._id.toString();
      if (!categoryMap[key]) {
        categoryMap[key] = { name: cat.name, color: cat.color, icon: cat.icon, total: 0 };
      }
      categoryMap[key].total += e.amount;
    });
    const categoryBreakdown = Object.values(categoryMap).sort((a, b) => b.total - a.total);
 
    // Daily spending this month
    const dailyMap = {};
    thisMonthExpenses.forEach((e) => {
      const day = new Date(e.date).getDate();
      dailyMap[day] = (dailyMap[day] || 0) + e.amount;
    });
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailySpending = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      total: dailyMap[i + 1] || 0,
    }));
 
    // This month income for net savings
    const thisMonthIncome = await Income.find({
      userId: req.userId,
      date: { $gte: thisStart, $lte: thisEnd },
    });
    const thisMonthIncomeTotal = thisMonthIncome.reduce((s, e) => s + e.amount, 0);
    const netSavings = thisMonthIncomeTotal - thisTotal;
 
    // Month comparison (last 6 months)
    const monthComparison = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const exps = await Expense.find({ userId: req.userId, date: { $gte: start, $lte: end } });
      const incs = await Income.find({ userId: req.userId, date: { $gte: start, $lte: end } });
      monthComparison.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        expenses: exps.reduce((s, e) => s + e.amount, 0),
        income: incs.reduce((s, e) => s + e.amount, 0),
      });
    }
 
    res.json({
      thisTotal,
      prevTotal,
      netSavings,
      thisMonthIncomeTotal,
      categoryBreakdown,
      dailySpending,
      monthComparison,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
module.exports = router;