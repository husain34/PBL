const express = require("express");
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

const router = express.Router();

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

router.post("/submit", authMiddleware, async (req, res) => {
  const { answers, investorType, spenderType } = req.body;

  if (!answers || !investorType || !spenderType) {
    return res.status(400).json({ message: "Missing profile data" });
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .update({
        profile_completed: true,
        investor_type: investorType,
        spender_type: spenderType,
        age_range: answers.ageRange || null,
        employment_status: answers.employmentStatus || null,
        monthly_income: answers.monthlyIncome || null,
        follows_budget: answers.followsBudget || null,
        biggest_spend_category: answers.biggestSpendCategory || null,
        tracks_expenses: answers.tracksExpenses || null,
        has_debt: answers.hasDebt || null,
        investment_goal: answers.investmentGoal || null,
        investment_horizon: answers.investmentHorizon || null,
        primary_financial_goal: answers.primaryFinancialGoal || null,
      })
      .eq("id", req.userId)
      .select()
      .single();

    if (error) throw error;
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "Profile saved successfully",
      investorType: user.investor_type,
      spenderType: user.spender_type,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { data: u, error } = await supabase
      .from("users")
      .select("name, email, profile_completed, investor_type, spender_type, age_range, employment_status, monthly_income, follows_budget, biggest_spend_category, tracks_expenses, has_debt, investment_goal, investment_horizon, primary_financial_goal")
      .eq("id", req.userId)
      .single();

    if (error) throw error;

    const user = {
      _id: req.userId,
      name: u.name,
      email: u.email,
      profileCompleted: u.profile_completed,
      investorType: u.investor_type,
      spenderType: u.spender_type,
      profileAnswers: {
        ageRange: u.age_range,
        employmentStatus: u.employment_status,
        monthlyIncome: u.monthly_income,
        followsBudget: u.follows_budget,
        biggestSpendCategory: u.biggest_spend_category,
        tracksExpenses: u.tracks_expenses,
        hasDebt: u.has_debt,
        investmentGoal: u.investment_goal,
        investmentHorizon: u.investment_horizon,
        primaryFinancialGoal: u.primary_financial_goal,
      }
    };
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
