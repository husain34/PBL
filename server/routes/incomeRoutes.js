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

function formatIncome(i) {
  if (!i) return null;
  return {
    ...i,
    _id: i.id,
    userId: i.user_id,
    isSalary: i.is_salary
  };
}

// POST /api/income
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
    const { data: entry, error: iErr } = await supabase.from('incomes').insert({
      user_id: req.userId,
      amount: Number(amount),
      source,
      frequency,
      date: entryDate.toISOString(),
      note: note || "",
      is_salary: false
    }).select().single();
    if (iErr) throw iErr;

    const { data: user } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    await supabase.from('users').update({ total_balance: (user.total_balance || 0) + Number(amount) }).eq('id', req.userId);

    res.status(201).json(formatIncome(entry));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/income/salary
router.put("/salary", authMiddleware, async (req, res) => {
  const { amount, note, month } = req.body;
  if (!amount || Number(amount) <= 0)
    return res.status(400).json({ message: "Valid amount required" });

  try {
    const now = new Date();
    let monthStart, monthEnd;
    
    if (month) {
      const [year, monthNum] = month.split("-");
      monthStart = new Date(Number(year), Number(monthNum) - 1, 1).toISOString();
      monthEnd = new Date(Number(year), Number(monthNum), 0, 23, 59, 59).toISOString();
    } else {
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    }

    const { data: existing } = await supabase.from('incomes')
      .select()
      .eq('user_id', req.userId)
      .eq('source', 'Salary')
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .limit(1)
      .maybeSingle();

    const { data: user, error: uErr } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    if (uErr) return res.status(404).json({ message: "User not found" });

    if (existing) {
      const diff = Number(amount) - existing.amount;
      const { data: updated } = await supabase.from('incomes').update({
        amount: Number(amount),
        note: note || existing.note
      }).eq('id', existing.id).select().single();

      const newBalance = Math.max(0, (user.total_balance || 0) + diff);
      await supabase.from('users').update({ total_balance: newBalance }).eq('id', req.userId);
      return res.json({ entry: formatIncome(updated), totalBalance: newBalance, updated: true });
    }

    const [year, monthNum] = (month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).split("-");
    const { data: entry } = await supabase.from('incomes').insert({
      user_id: req.userId,
      amount: Number(amount),
      source: "Salary",
      frequency: "Monthly",
      date: new Date(Number(year), Number(monthNum) - 1, 1).toISOString(),
      note: note || "",
      is_salary: true
    }).select().single();

    const newBalance = (user.total_balance || 0) + Number(amount);
    await supabase.from('users').update({ total_balance: newBalance }).eq('id', req.userId);
    res.status(201).json({ entry: formatIncome(entry), totalBalance: newBalance, updated: false });
  } catch (err) {
    console.error("Salary update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/income/salary
router.get("/salary", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const { month } = req.query;
    let monthStart, monthEnd;
    
    if (month) {
      const [year, monthNum] = month.split("-");
      monthStart = new Date(Number(year), Number(monthNum) - 1, 1).toISOString();
      monthEnd = new Date(Number(year), Number(monthNum), 0, 23, 59, 59).toISOString();
    } else {
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    }
    
    const { data: entry } = await supabase.from('incomes')
      .select()
      .eq('user_id', req.userId)
      .eq('source', 'Salary')
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .limit(1)
      .maybeSingle();

    res.json({ entry: entry ? formatIncome(entry) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/income/:id
router.put("/:id", authMiddleware, async (req, res) => {
  const { amount, source, frequency, note } = req.body;
  if (source === "Salary")
    return res.status(400).json({ message: "Use the salary endpoint to manage salary" });
  try {
    const { data: entry, error: getErr } = await supabase.from('incomes').select().eq('id', req.params.id).eq('user_id', req.userId).single();
    if (getErr || !entry) return res.status(404).json({ message: "Entry not found" });

    const diff = Number(amount) - entry.amount;
    const updates = {};
    if (amount !== undefined) updates.amount = Number(amount);
    if (source !== undefined) updates.source = source;
    if (frequency !== undefined) updates.frequency = frequency;
    if (note !== undefined) updates.note = note;

    const { data: updatedEntry } = await supabase.from('incomes').update(updates).eq('id', req.params.id).select().single();

    const { data: user } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    await supabase.from('users').update({ total_balance: (user.total_balance || 0) + diff }).eq('id', req.userId);

    res.json(formatIncome(updatedEntry));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/income
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { data: entries, error } = await supabase.from('incomes').select().eq('user_id', req.userId).order('date', { ascending: false });
    if (error) throw error;
    res.json(entries.map(formatIncome));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/income/summary
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data: thisMonthEntries } = await supabase.from('incomes').select().eq('user_id', req.userId).gte('date', startOfMonth).lte('date', endOfMonth);
    const thisMonthTotal = (thisMonthEntries || []).reduce((s, e) => s + e.amount, 0);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const { data: allEntries } = await supabase.from('incomes').select().eq('user_id', req.userId).gte('date', sixMonthsAgo.toISOString());

    const monthMap = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap[key] = { month: key, total: 0 };
    }
    
    (allEntries || []).forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthMap[key]) monthMap[key].total += e.amount;
    });
    const monthlyChart = Object.values(monthMap);

    const { data: allUserEntries } = await supabase.from('incomes').select('source, amount').eq('user_id', req.userId);
    const sourceMap = {};
    (allUserEntries || []).forEach((e) => {
      sourceMap[e.source] = (sourceMap[e.source] || 0) + e.amount;
    });
    const sourceBreakdown = Object.entries(sourceMap).map(([source, total]) => ({ source, total }));

    const forecast = [];
    const salaryEntry = (thisMonthEntries || []).find((e) => e.source === "Salary");
    const recurringEntries = await supabase.from('incomes').select('amount').eq('user_id', req.userId).eq('frequency', 'Monthly').gte('date', startOfMonth).lte('date', endOfMonth);

    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const projected = (recurringEntries.data || []).reduce((s, e) => s + e.amount, 0);
      forecast.push({ month: key, projected });
    }

    const { data: user } = await supabase.from('users').select('total_balance, monthly_income').eq('id', req.userId).single();
    const profileIncome = user?.monthly_income || null;
    const totalBalance = user?.total_balance || 0;

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
    const { data: entry, error: getErr } = await supabase.from('incomes').select('amount').eq('id', req.params.id).eq('user_id', req.userId).single();
    if (getErr || !entry) return res.status(404).json({ message: "Entry not found" });

    await supabase.from('incomes').delete().eq('id', req.params.id);
    const { data: user } = await supabase.from('users').select('total_balance').eq('id', req.userId).single();
    await supabase.from('users').update({ total_balance: Math.max(0, (user.total_balance || 0) - entry.amount) }).eq('id', req.userId);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;