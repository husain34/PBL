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

function formatExpense(e) {
  if (!e) return null;
  return {
    ...e,
    _id: e.id,
    userId: e.user_id,
    categoryId: e.categories ? { ...e.categories, _id: e.categories.id } : e.category_id,
    paymentMode: e.payment_mode,
    isRecurring: e.is_recurring,
    recurringMonthsLeft: e.recurring_months_left
  };
}

router.post("/", authMiddleware, async (req, res) => {
  const { amount, categoryId, date, note, paymentMode, isRecurring, recurringMonthsLeft } = req.body;
  if (!amount || !categoryId || !date)
    return res.status(400).json({ message: "Missing required fields" });
  try {
    const { data: user, error: uErr } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    if (uErr) throw uErr;

    if ((user.total_balance || 0) < Number(amount))
      return res.status(400).json({ message: "Expense exceeds your total balance" });

    const { data: expense, error: eErr } = await supabase.from('expenses').insert({
      user_id: req.userId,
      amount: Number(amount),
      category_id: categoryId,
      date,
      note: note || "",
      payment_mode: paymentMode || "UPI",
      is_recurring: isRecurring || false,
      recurring_months_left: isRecurring ? (recurringMonthsLeft || 0) : 0,
    }).select('*, categories(id, name, icon, color, type)').single();
    if (eErr) throw eErr;

    const newBalance = Math.max(0, (user.total_balance || 0) - Number(amount));
    await supabase.from('users').update({ total_balance: newBalance }).eq('id', req.userId);

    res.status(201).json(formatExpense(expense));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  const { amount, categoryId, date, note, paymentMode, isRecurring, recurringMonthsLeft } = req.body;
  try {
    const { data: expense, error: getErr } = await supabase.from('expenses').select().eq('id', req.params.id).eq('user_id', req.userId).single();
    if (getErr) return res.status(404).json({ message: "Not found" });

    const diff = Number(amount) - expense.amount;
    const { data: user, error: userErr } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    if (userErr) throw userErr;

    if (diff > 0) {
      if ((user.total_balance || 0) < diff)
        return res.status(400).json({ message: "Edit would exceed your total balance" });
    }

    const updates = {};
    if (amount !== undefined) updates.amount = Number(amount);
    if (categoryId !== undefined) updates.category_id = categoryId;
    if (date !== undefined) updates.date = date;
    if (note !== undefined) updates.note = note;
    if (paymentMode !== undefined) updates.payment_mode = paymentMode;
    if (isRecurring !== undefined) updates.is_recurring = isRecurring;
    if (recurringMonthsLeft !== undefined) updates.recurring_months_left = recurringMonthsLeft;

    const { data: updatedExpense, error: updErr } = await supabase.from('expenses')
      .update(updates).eq('id', req.params.id).select('*, categories(id, name, icon, color, type)').single();
    if (updErr) throw updErr;

    await supabase.from('users').update({ total_balance: (user.total_balance - diff) }).eq('id', req.userId);

    res.json(formatExpense(updatedExpense));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/apply-recurring", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

    const { data: recurringLastMonth, error: rErr } = await supabase.from('expenses')
      .select()
      .eq('user_id', req.userId)
      .eq('is_recurring', true)
      .gte('date', prevStart)
      .lte('date', prevEnd);
      
    if (rErr) throw rErr;
    
    const validRecurring = recurringLastMonth.filter(e => e.recurring_months_left === 0 || e.recurring_months_left > 0);

    if (validRecurring.length === 0)
      return res.json({ applied: 0, message: "No recurring expenses found" });

    const { data: alreadyApplied, error: aErr } = await supabase.from('expenses')
      .select()
      .eq('user_id', req.userId)
      .eq('is_recurring', true)
      .gte('date', thisStart)
      .lte('date', thisEnd)
      .limit(1);

    if (alreadyApplied && alreadyApplied.length > 0)
      return res.json({ applied: 0, message: "Already applied this month" });

    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { data: user, error: uErr } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    if (uErr) throw uErr;

    let totalDeducted = 0;
    const newExpenses = [];

    for (const e of validRecurring) {
      if (e.recurring_months_left === 1) continue;
      newExpenses.push({
        user_id: req.userId,
        amount: e.amount,
        category_id: e.category_id,
        date: firstOfMonth.toISOString(),
        note: e.note,
        payment_mode: e.payment_mode,
        is_recurring: true,
        recurring_months_left: e.recurring_months_left > 1 ? e.recurring_months_left - 1 : 0,
      });
      totalDeducted += e.amount;
    }

    if (newExpenses.length === 0)
      return res.json({ applied: 0, message: "All recurring expenses have expired" });

    const { error: iErr } = await supabase.from('expenses').insert(newExpenses);
    if (iErr) throw iErr;
    
    await supabase.from('users').update({ total_balance: Math.max(0, user.total_balance - totalDeducted) }).eq('id', req.userId);

    res.json({ applied: newExpenses.length, totalDeducted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { month, year } = req.query;
    let query = supabase.from('expenses').select('*, categories(id, name, icon, color, type)').eq('user_id', req.userId).order('date', { ascending: false });

    if (month) {
      const [y, m] = month.split("-");
      query = query.gte('date', new Date(y, m - 1, 1).toISOString()).lte('date', new Date(y, m, 0, 23, 59, 59).toISOString());
    } else if (year) {
      query = query.gte('date', new Date(year, 0, 1).toISOString()).lte('date', new Date(year, 11, 31, 23, 59, 59).toISOString());
    }

    const { data: expenses, error } = await query;
    if (error) throw error;
    res.json(expenses.map(formatExpense));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { data: expense, error: getErr } = await supabase.from('expenses').select().eq('id', req.params.id).eq('user_id', req.userId).single();
    if (getErr || !expense) return res.status(404).json({ message: "Not found" });

    await supabase.from('expenses').delete().eq('id', req.params.id);
    
    const { data: user, error: uErr } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    if (!uErr && user) {
        await supabase.from('users').update({ total_balance: user.total_balance + expense.amount }).eq('id', req.userId);
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/analytics", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

    const { data: thisMonthExpensesRaw } = await supabase.from('expenses').select('*, categories(id, name, icon, color, type)').eq('user_id', req.userId).gte('date', thisStart).lte('date', thisEnd);
    const { data: prevMonthExpensesRaw } = await supabase.from('expenses').select('*, categories(id, name, icon, color, type)').eq('user_id', req.userId).gte('date', prevStart).lte('date', prevEnd);

    const thisMonthExpenses = (thisMonthExpensesRaw || []).map(formatExpense);
    const prevMonthExpenses = (prevMonthExpensesRaw || []).map(formatExpense);

    const thisTotal = thisMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const prevTotal = prevMonthExpenses.reduce((s, e) => s + e.amount, 0);

    const categoryMap = {};
    thisMonthExpenses.forEach((e) => {
      const cat = e.categoryId;
      if (!cat) return;
      const key = cat._id;
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

    const { data: thisMonthIncome } = await supabase.from('incomes').select().eq('user_id', req.userId).gte('date', thisStart).lte('date', thisEnd);
    const thisMonthIncomeTotal = (thisMonthIncome || []).reduce((s, e) => s + e.amount, 0);
    const netSavings = thisMonthIncomeTotal - thisTotal;

    const { data: allIncome } = await supabase.from('incomes').select('amount').eq('user_id', req.userId);
    const { data: allExpenses } = await supabase.from('expenses').select('amount').eq('user_id', req.userId);
    const overallSavings = (allIncome || []).reduce((s, e) => s + e.amount, 0) - (allExpenses || []).reduce((s, e) => s + e.amount, 0);

    const { data: user } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    const totalBalance = user?.total_balance || 0;

    const monthComparison = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const { data: exps } = await supabase.from('expenses').select('amount').eq('user_id', req.userId).gte('date', start).lte('date', end);
      const { data: incs } = await supabase.from('incomes').select('amount').eq('user_id', req.userId).gte('date', start).lte('date', end);
      monthComparison.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        expenses: (exps || []).reduce((s, e) => s + e.amount, 0),
        income: (incs || []).reduce((s, e) => s + e.amount, 0),
      });
    }

    const { data: recurringExpensesRaw } = await supabase.from('expenses').select('*, categories(id, name, icon, color, type)').eq('user_id', req.userId).eq('is_recurring', true).gte('date', thisStart).lte('date', thisEnd);
    const recurringExpenses = (recurringExpensesRaw || []).map(formatExpense);

    const { data: recurringIncome } = await supabase.from('incomes').select('amount').eq('user_id', req.userId).eq('frequency', 'Monthly').gte('date', thisStart).lte('date', thisEnd);

    const expenseForecast = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const projectedExpenses = recurringExpenses
        .filter((e) => e.recurringMonthsLeft === 0 || e.recurringMonthsLeft >= i)
        .reduce((s, e) => s + e.amount, 0);
      const projectedIncome = (recurringIncome || []).reduce((s, e) => s + e.amount, 0);
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