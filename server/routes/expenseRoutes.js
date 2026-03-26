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
  const { amount, categoryId, date, note, paymentMode, isRecurring, recurringMonthsLeft } = req.body;
  if (!amount || !categoryId || !date)
    return res.status(400).json({ message: "Missing required fields" });
  try {
    const user = await User.findById(req.userId);
    if ((user.totalBalance || 0) < Number(amount))
      return res.status(400).json({ message: "Expense exceeds your total balance" });

    const expense = await Expense.create({
      userId: req.userId,
      amount: Number(amount),
      categoryId,
      date,
      note: note || "",
      paymentMode: paymentMode || "UPI",
      isRecurring: isRecurring || false,
      recurringMonthsLeft: isRecurring ? (recurringMonthsLeft || 0) : 0,
    });
    const populated = await expense.populate("categoryId", "name icon color");
    user.totalBalance = Math.max(0, (user.totalBalance || 0) - Number(amount));
    await user.save();
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id — edit expense
router.put("/:id", authMiddleware, async (req, res) => {
  const { amount, categoryId, date, note, paymentMode, isRecurring, recurringMonthsLeft } = req.body;
  try {
    const expense = await Expense.findOne({ _id: req.params.id, userId: req.userId });
    if (!expense) return res.status(404).json({ message: "Not found" });

    const diff = Number(amount) - expense.amount;

    // Check balance if increasing amount
    if (diff > 0) {
      const user = await User.findById(req.userId);
      if ((user.totalBalance || 0) < diff)
        return res.status(400).json({ message: "Edit would exceed your total balance" });
    }

    expense.amount = Number(amount) || expense.amount;
    if (categoryId) expense.categoryId = categoryId;
    if (date) expense.date = date;
    if (note !== undefined) expense.note = note;
    if (paymentMode) expense.paymentMode = paymentMode;
    if (isRecurring !== undefined) expense.isRecurring = isRecurring;
    if (recurringMonthsLeft !== undefined) expense.recurringMonthsLeft = recurringMonthsLeft;
    await expense.save();

    await User.findByIdAndUpdate(req.userId, { $inc: { totalBalance: -diff } });
    const populated = await expense.populate("categoryId", "name icon color type");
    res.json(populated);
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

    // Get recurring expenses from last month that still have months left (or indefinite = 0)
    const recurringLastMonth = await Expense.find({
      userId: req.userId,
      isRecurring: true,
      date: { $gte: prevStart, $lte: prevEnd },
      $or: [{ recurringMonthsLeft: 0 }, { recurringMonthsLeft: { $gt: 0 } }],
    });

    if (recurringLastMonth.length === 0)
      return res.json({ applied: 0, message: "No recurring expenses found" });

    const alreadyApplied = await Expense.findOne({
      userId: req.userId,
      isRecurring: true,
      date: { $gte: thisStart, $lte: thisEnd },
    });
    if (alreadyApplied)
      return res.json({ applied: 0, message: "Already applied this month" });

    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const user = await User.findById(req.userId);
    let totalDeducted = 0;
    const newExpenses = [];

    for (const e of recurringLastMonth) {
      // Skip if months ran out (recurringMonthsLeft was 1 last month, meaning this is the last)
      if (e.recurringMonthsLeft === 1) continue;
      newExpenses.push({
        userId: req.userId,
        amount: e.amount,
        categoryId: e.categoryId,
        date: firstOfMonth,
        note: e.note,
        paymentMode: e.paymentMode,
        isRecurring: true,
        // Decrement months left, keep 0 as indefinite
        recurringMonthsLeft: e.recurringMonthsLeft > 1 ? e.recurringMonthsLeft - 1 : 0,
      });
      totalDeducted += e.amount;
    }

    if (newExpenses.length === 0)
      return res.json({ applied: 0, message: "All recurring expenses have expired" });

    await Expense.insertMany(newExpenses);
    user.totalBalance = Math.max(0, (user.totalBalance || 0) - totalDeducted);
    await user.save();

    res.json({ applied: newExpenses.length, totalDeducted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/expenses?month=YYYY-MM&year=YYYY
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { month, year } = req.query;
    let filter = { userId: req.userId };

    if (month) {
      const [y, m] = month.split("-");
      filter.date = {
        $gte: new Date(y, m - 1, 1),
        $lte: new Date(y, m, 0, 23, 59, 59),
      };
    } else if (year) {
      filter.date = {
        $gte: new Date(year, 0, 1),
        $lte: new Date(year, 11, 31, 23, 59, 59),
      };
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
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!expense) return res.status(404).json({ message: "Not found" });
    await User.findByIdAndUpdate(req.userId, { $inc: { totalBalance: expense.amount } });
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
      day: i + 1, total: dailyMap[i + 1] || 0,
    }));

    const thisMonthIncome = await Income.find({ userId: req.userId, date: { $gte: thisStart, $lte: thisEnd } });
    const thisMonthIncomeTotal = thisMonthIncome.reduce((s, e) => s + e.amount, 0);
    const netSavings = thisMonthIncomeTotal - thisTotal;

    const [allIncome, allExpenses] = await Promise.all([
      Income.find({ userId: req.userId }),
      Expense.find({ userId: req.userId }),
    ]);
    const overallSavings = allIncome.reduce((s, e) => s + e.amount, 0) - allExpenses.reduce((s, e) => s + e.amount, 0);

    const user = await User.findById(req.userId).select("totalBalance");
    const totalBalance = user?.totalBalance || 0;

    // 6-month history (income vs expenses only — goals shown separately)
    const monthComparison = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const [exps, incs] = await Promise.all([
        Expense.find({ userId: req.userId, date: { $gte: start, $lte: end } }),
        Income.find({ userId: req.userId, date: { $gte: start, $lte: end } }),
      ]);
      monthComparison.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        expenses: exps.reduce((s, e) => s + e.amount, 0),
        income: incs.reduce((s, e) => s + e.amount, 0),
      });
    }

    // 6-month forecast: project recurring expenses forward
    const recurringExpenses = await Expense.find({
      userId: req.userId,
      isRecurring: true,
      date: { $gte: thisStart, $lte: thisEnd },
    }).populate("categoryId", "name icon color");

    const recurringIncome = await Income.find({
      userId: req.userId,
      frequency: "Monthly",
      date: { $gte: thisStart, $lte: thisEnd },
    });

    const expenseForecast = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const projectedExpenses = recurringExpenses
        .filter((e) => e.recurringMonthsLeft === 0 || e.recurringMonthsLeft >= i)
        .reduce((s, e) => s + e.amount, 0);
      const projectedIncome = recurringIncome.reduce((s, e) => s + e.amount, 0);
      expenseForecast.push({ month: key, projectedExpenses, projectedIncome });
    }

    res.json({
      thisTotal, prevTotal, netSavings, overallSavings, totalBalance,
      thisMonthIncomeTotal, categoryBreakdown, dailySpending,
      monthComparison, expenseForecast,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;