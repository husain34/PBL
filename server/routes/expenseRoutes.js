const express = require("express");
const jwt = require("jsonwebtoken");
const Expense = require("../models/Expense");
const Income = require("../models/Income");
const User = require("../models/User");
const GoalAllocation = require("../models/GoalAllocation");

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
    // Block if expense exceeds savings pot
    const user = await User.findById(req.userId);
    if ((user.savingsPot || 0) < Number(amount))
      return res.status(400).json({ message: "Expense exceeds your savings pot balance" });

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

    user.savingsPot = Math.max(0, (user.savingsPot || 0) - Number(amount));
    await user.save();

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses/apply-recurring
router.post("/apply-recurring", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const recurringLastMonth = await Expense.find({
      userId: req.userId,
      isRecurring: true,
      date: { $gte: prevStart, $lte: prevEnd },
    });

    if (recurringLastMonth.length === 0)
      return res.json({ applied: 0, message: "No recurring expenses found" });

    const alreadyApplied = await Expense.findOne({
      userId: req.userId,
      isRecurring: true,
      date: { $gte: thisStart, $lte: thisEnd },
    });

    if (alreadyApplied)
      return res.json({ applied: 0, message: "Recurring expenses already applied this month" });

    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const user = await User.findById(req.userId);

    const newExpenses = recurringLastMonth.map((e) => ({
      userId: req.userId,
      amount: e.amount,
      categoryId: e.categoryId,
      date: firstOfMonth,
      note: e.note,
      paymentMode: e.paymentMode,
      isRecurring: true,
    }));

    await Expense.insertMany(newExpenses);

    const totalDeducted = recurringLastMonth.reduce((s, e) => s + e.amount, 0);
    user.savingsPot = Math.max(0, (user.savingsPot || 0) - totalDeducted);
    await user.save();

    res.json({ applied: newExpenses.length, totalDeducted });
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

    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [thisMonthExpenses, prevMonthExpenses] = await Promise.all([
      Expense.find({ userId: req.userId, date: { $gte: thisStart, $lte: thisEnd } })
        .populate("categoryId", "name icon color type"),
      Expense.find({ userId: req.userId, date: { $gte: prevStart, $lte: prevEnd } })
        .populate("categoryId", "name icon color type"),
    ]);

    const thisTotal = thisMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const prevTotal = prevMonthExpenses.reduce((s, e) => s + e.amount, 0);

    const categoryMap = {};
    thisMonthExpenses.forEach((e) => {
      const cat = e.categoryId;
      if (!cat) return;
      const key = cat._id.toString();
      if (!categoryMap[key])
        categoryMap[key] = { name: cat.name, color: cat.color, icon: cat.icon, total: 0 };
      categoryMap[key].total += e.amount;
    });
    const categoryBreakdown = Object.values(categoryMap).sort((a, b) => b.total - a.total);

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

    const thisMonthIncome = await Income.find({
      userId: req.userId,
      date: { $gte: thisStart, $lte: thisEnd },
    });
    const thisMonthIncomeTotal = thisMonthIncome.reduce((s, e) => s + e.amount, 0);
    const netSavings = thisMonthIncomeTotal - thisTotal;

    // Overall savings: all-time income minus all-time expenses
    const [allIncome, allExpenses] = await Promise.all([
      Income.find({ userId: req.userId }),
      Expense.find({ userId: req.userId }),
    ]);
    const totalIncomeAllTime = allIncome.reduce((s, e) => s + e.amount, 0);
    const totalExpensesAllTime = allExpenses.reduce((s, e) => s + e.amount, 0);
    const overallSavings = totalIncomeAllTime - totalExpensesAllTime;

    const user = await User.findById(req.userId).select("savingsPot");
    const savingsPot = user?.savingsPot || 0;

    const monthComparison = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const exps = await Expense.find({ userId: req.userId, date: { $gte: start, $lte: end } });
      const incs = await Income.find({ userId: req.userId, date: { $gte: start, $lte: end } });
      const allocs = await GoalAllocation.find({ userId: req.userId, date: { $gte: start, $lte: end } });
      monthComparison.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        expenses: exps.reduce((s, e) => s + e.amount, 0),
        income: incs.reduce((s, e) => s + e.amount, 0),
        goalsAllocated: allocs.reduce((s, e) => s + e.amount, 0),
      });
    }

    res.json({
      thisTotal,
      prevTotal,
      netSavings,
      overallSavings,
      savingsPot,
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