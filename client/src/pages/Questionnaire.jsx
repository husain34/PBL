import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const questions = [
  {
    id: "ageRange",
    section: "About You",
    question: "What is your age range?",
    options: ["18-25", "26-35", "36-50", "50+"],
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
    options: ["< INR 20k", "INR 20k - INR 50k", "INR 50k - INR 1L", "> INR 1L"],
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
    options: ["< 1 year", "1-3 years", "3-10 years", "10+ years"],
  },
  {
    id: "primaryFinancialGoal",
    section: "Goals",
    question: "What is your primary financial goal right now?",
    options: ["Build emergency fund", "Pay off debt", "Save for a big purchase", "Grow wealth"],
  },
];

function computeProfiles(answers) {
  const horizonScore = { "< 1 year": 1, "1-3 years": 2, "3-10 years": 3, "10+ years": 4 };
  const goalScore = { "Capital preservation": 1, "Steady growth": 2, "Wealth maximization": 3 };
  const ageScore = { "50+": 1, "36-50": 2, "26-35": 3, "18-25": 4 };

  const investorTotal =
    (horizonScore[answers.investmentHorizon] || 2) +
    (goalScore[answers.investmentGoal] || 2) +
    (ageScore[answers.ageRange] || 2);

  const investorType = investorTotal <= 5 ? "Conservative" : investorTotal <= 8 ? "Moderate" : "Aggressive";

  const budgetScore = { Never: 1, Sometimes: 2, Always: 3 };
  const trackScore = { Never: 1, Manually: 2, "Using an app": 3 };
  const debtScore = { "Significant debt": 1, "Some EMIs": 2, "No debt": 3 };

  const spenderTotal =
    (budgetScore[answers.followsBudget] || 2) +
    (trackScore[answers.tracksExpenses] || 2) +
    (debtScore[answers.hasDebt] || 2);

  const spenderType = spenderTotal <= 4 ? "Impulsive" : spenderTotal <= 7 ? "Moderate Spender" : "Disciplined";

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
  const progress = (current / questions.length) * 100;
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

  if (submitted && profiles) {
    return (
      <div className="auth-shell auth-shell-centered">
        <div className="auth-backdrop auth-backdrop-profile" />
        <div className="auth-result-card">
          <p className="dashboard-eyebrow">Profile Ready</p>
          <h1>Your Financial Profile</h1>
          <p className="auth-result-copy">
            Based on your answers, we have created a personalized starting point for your planning and portfolio experience.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <div className="dashboard-stat-card dashboard-stat-card-violet">
              <p className="dashboard-stat-label">Investor Type</p>
              <p className="dashboard-stat-value dashboard-stat-value-sm">{profiles.investorType}</p>
            </div>
            <div className="dashboard-stat-card dashboard-stat-card-emerald">
              <p className="dashboard-stat-label">Spender Type</p>
              <p className="dashboard-stat-value dashboard-stat-value-sm">{profiles.spenderType}</p>
            </div>
          </div>

          <div className="auth-result-note">
            Your <strong>{profiles.investorType}</strong> investor profile shapes allocation guidance, while your{" "}
            <strong>{profiles.spenderType}</strong> spending style informs budgeting insights.
          </div>

          <button onClick={() => navigate("/portfolio")} className="dashboard-primary-button w-full">
            <span className="dashboard-button-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </span>
            Go to Portfolio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell auth-shell-centered">
      <div className="auth-backdrop auth-backdrop-profile" />

      <div className="questionnaire-card">
        <div className="questionnaire-sidebar">
          <p className="dashboard-eyebrow">Profile Setup</p>
          <h1>Let&apos;s shape your financial profile.</h1>
          <p>
            Answer a few quick questions so we can tailor budgeting guidance, portfolio suggestions, and dashboard insights.
          </p>

          <div className="questionnaire-progress-block">
            <span>Progress</span>
            <strong>
              {current + 1} / {questions.length}
            </strong>
          </div>
        </div>

        <div className="questionnaire-main">
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-6">
            <div className="h-full bg-[linear-gradient(135deg,#6f16d9,#15b8e6)] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>

          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold mb-4 ${sectionColors[q.section]}`}>
            {q.section}
          </div>

          <div className={`transition-all duration-200 ${animating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}`}>
            <p className="questionnaire-question">{q.question}</p>

            <div className="space-y-3">
              {q.options.map((option) => {
                const isSelected = selectedAnswer === option;
                return (
                  <button
                    key={option}
                    onClick={() => handleSelect(option)}
                    className={`questionnaire-option ${isSelected ? "questionnaire-option-selected" : ""}`}
                  >
                    <span className={`questionnaire-check ${isSelected ? "questionnaire-check-selected" : ""}`}>✓</span>
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-5">{error}</p>}

          <div className="questionnaire-actions">
            {current > 0 && (
              <button onClick={handleBack} className="questionnaire-secondary-button">
                Back
              </button>
            )}

            {!isLast ? (
              <button
                onClick={handleNext}
                disabled={!selectedAnswer}
                className={`dashboard-primary-button ${!selectedAnswer ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!selectedAnswer || loading}
                className={`dashboard-primary-button ${!selectedAnswer || loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {loading ? "Saving..." : "Submit"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
