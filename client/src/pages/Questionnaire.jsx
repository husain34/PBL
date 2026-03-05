import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const questions = [
  {
    id: "ageRange",
    section: "About You",
    question: "What is your age range?",
    options: ["18–25", "26–35", "36–50", "50+"],
  },
  {
    id: "employmentStatus",
    section: "About You",
    question: "What is your employment status?",
    options: ["Salaried", "Self-employed", "Student", "Retired"],
  },
  {
    id: "monthlyIncome",
    section: "Income & Savings",
    question: "What is your monthly income range?",
    options: ["< ₹20k", "₹20k – ₹50k", "₹50k – ₹1L", "> ₹1L"],
  },
  {
    id: "followsBudget",
    section: "Income & Savings",
    question: "Do you follow a monthly budget?",
    options: ["Never", "Sometimes", "Always"],
  },
  {
    id: "biggestSpendCategory",
    section: "Spending Habits",
    question: "What is your biggest spending category?",
    options: ["Food & Dining", "Housing", "Transport", "Shopping", "Entertainment"],
  },
  {
    id: "tracksExpenses",
    section: "Spending Habits",
    question: "Do you track your expenses?",
    options: ["Never", "Manually", "Using an app"],
  },
  {
    id: "hasDebt",
    section: "Spending Habits",
    question: "Do you have EMIs or recurring debt?",
    options: ["No debt", "Some EMIs", "Significant debt"],
  },
  {
    id: "investmentGoal",
    section: "Investment Profile",
    question: "What is your primary investment goal?",
    options: ["Capital preservation", "Steady growth", "Wealth maximization"],
  },
  {
    id: "investmentHorizon",
    section: "Investment Profile",
    question: "What is your investment horizon?",
    options: ["< 1 year", "1–3 years", "3–10 years", "10+ years"],
  },
  {
    id: "primaryFinancialGoal",
    section: "Goals",
    question: "What is your primary financial goal right now?",
    options: [
      "Build emergency fund",
      "Pay off debt",
      "Save for a big purchase",
      "Grow wealth",
    ],
  },
];

// Scoring logic
function computeProfiles(answers) {
  // --- Investor profile score ---
  const horizonScore = {
    "< 1 year": 1,
    "1–3 years": 2,
    "3–10 years": 3,
    "10+ years": 4,
  };
  const goalScore = {
    "Capital preservation": 1,
    "Steady growth": 2,
    "Wealth maximization": 3,
  };
  const ageScore = { "50+": 1, "36–50": 2, "26–35": 3, "18–25": 4 };

  const investorTotal =
    (horizonScore[answers.investmentHorizon] || 2) +
    (goalScore[answers.investmentGoal] || 2) +
    (ageScore[answers.ageRange] || 2);

  let investorType =
    investorTotal <= 5
      ? "Conservative"
      : investorTotal <= 8
      ? "Moderate"
      : "Aggressive";

  // --- Spender profile score ---
  const budgetScore = { Never: 1, Sometimes: 2, Always: 3 };
  const trackScore = { Never: 1, Manually: 2, "Using an app": 3 };
  const debtScore = { "Significant debt": 1, "Some EMIs": 2, "No debt": 3 };

  const spenderTotal =
    (budgetScore[answers.followsBudget] || 2) +
    (trackScore[answers.tracksExpenses] || 2) +
    (debtScore[answers.hasDebt] || 2);

  let spenderType =
    spenderTotal <= 4
      ? "Impulsive"
      : spenderTotal <= 7
      ? "Moderate Spender"
      : "Disciplined";

  return { investorType, spenderType };
}

const sectionColors = {
  "About You": "bg-blue-50 text-blue-700 border-blue-200",
  "Income & Savings": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Spending Habits": "bg-amber-50 text-amber-700 border-amber-200",
  "Investment Profile": "bg-violet-50 text-violet-700 border-violet-200",
  Goals: "bg-rose-50 text-rose-700 border-rose-200",
};



export default function Questionnaire() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [profiles, setProfiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [animating, setAnimating] = useState(false);

  const q = questions[current];
  const progress = ((current) / questions.length) * 100;
  const isLast = current === questions.length - 1;
  const selectedAnswer = answers[q?.id];

  const handleSelect = (option) => {
    setAnswers((prev) => ({ ...prev, [q.id]: option }));
  };

  const handleNext = () => {
    if (!selectedAnswer) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent((c) => c + 1);
      setAnimating(false);
    }, 200);
  };

  const handleBack = () => {
    if (current === 0) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent((c) => c - 1);
      setAnimating(false);
    }, 200);
  };

  const handleSubmit = async () => {
    if (!selectedAnswer) return;
    const finalAnswers = { ...answers, [q.id]: selectedAnswer };
    const computed = computeProfiles(finalAnswers);
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "http://localhost:5000/api/profile/submit",
        { answers: finalAnswers, ...computed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfiles(computed);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Result screen
  if (submitted && profiles) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="auth-card max-w-lg w-full text-center space-y-8">
          <div>
            <div className="text-5xl mb-3"></div>
            <h1 className="text-2xl font-bold text-foreground">Your Financial Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Based on your answers, here's how we've profiled you
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-left">
              <p className="text-xs font-semibold text-violet-500 uppercase tracking-widest mb-1">
                Investor Type
              </p>
              <p className="text-lg font-bold text-violet-800">{profiles.investorType}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-widest mb-1">
                Spender Type
              </p>
              <p className="text-lg font-bold text-emerald-800">{profiles.spenderType}</p>
            </div>
          </div>

          <div className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground text-left space-y-1">
            <p>
              <span className="font-medium text-foreground">What this means: </span>
              Your <span className="font-semibold text-violet-700">{profiles.investorType}</span> investor
              profile will shape your portfolio allocations, while your{" "}
              <span className="font-semibold text-emerald-700">{profiles.spenderType}</span> spending
              persona will guide your budgeting insights.
            </p>
          </div>

          <button
            onClick={() => navigate("/home")}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Go to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="auth-card max-w-lg w-full space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              OPTIFOLIO
            </span>
            <span className="text-xs text-muted-foreground">
              {current + 1} / {questions.length}
            </span>
          </div>
          <h1 className="text-xl font-bold text-foreground">Financial Profile Setup</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Help us personalize your experience
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Section badge */}
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${
            sectionColors[q.section]
          }`}
        >
          {q.section}
        </div>

        {/* Question */}
        <div
          className={`transition-all duration-200 ${
            animating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}
        >
          <p className="text-base font-semibold text-foreground mb-4">{q.question}</p>

          <div className="space-y-2.5">
            {q.options.map((option) => {
              const isSelected = selectedAnswer === option;
              return (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-150 ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-border bg-card text-foreground hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full border text-xs mr-3 transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-muted-foreground/40 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Navigation */}
        <div className="flex gap-3 pt-1">
          {current > 0 && (
            <button
              onClick={handleBack}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              ← Back
            </button>
          )}
          {!isLast ? (
            <button
              onClick={handleNext}
              disabled={!selectedAnswer}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                selectedAnswer
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              }`}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!selectedAnswer || loading}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                selectedAnswer && !loading
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              }`}
            >
              {loading ? "Saving..." : "Submit ✓"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
