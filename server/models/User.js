const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  profileCompleted: { type: Boolean, default: false },

  investorType: {
    type: String,
    enum: ["Conservative", "Moderate", "Aggressive"],
    default: null,
  },
  spenderType: {
    type: String,
    enum: ["Disciplined", "Moderate Spender", "Impulsive"],
    default: null,
  },

  profileAnswers: {
    ageRange: { type: String, default: null },
    employmentStatus: { type: String, default: null },
    monthlyIncome: { type: String, default: null },
    followsBudget: { type: String, default: null },
    biggestSpendCategory: { type: String, default: null },
    tracksExpenses: { type: String, default: null },
    hasDebt: { type: String, default: null },
    investmentGoal: { type: String, default: null },
    investmentHorizon: { type: String, default: null },
    primaryFinancialGoal: { type: String, default: null },
  },

  // Renamed from savingsPot to totalBalance
  totalBalance: { type: Number, default: 0 },
});

module.exports = mongoose.model("User", userSchema);