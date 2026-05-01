import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "../api/axios";

const featurePoints = [
  "Personalized portfolio profiling",
  "Smart income and expense tracking",
  "Clear goal-based planning",
];

const Signup = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await axios.post("/auth/signup", form);
      alert("Signup successful!");
      navigate("/login");
    } catch (error) {
      alert(error.response?.data?.message || "Signup failed");
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-backdrop auth-backdrop-signup" />

      <section className="auth-showcase">
        <p className="dashboard-eyebrow">OPTIFOLIO</p>
        <h1 className="auth-showcase-title">Build a calmer, clearer financial system from day one.</h1>
        <p className="auth-showcase-copy">
          Create your account to unlock a polished dashboard for planning, tracking, and optimizing your money decisions.
        </p>

        <div className="auth-showcase-card">
          <p className="auth-showcase-label">What you get</p>
          <div className="auth-feature-list">
            {featurePoints.map((item) => (
              <div key={item} className="auth-feature-item">
                <span className="auth-feature-dot" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-card">
          <div className="auth-form-header">
            <p className="dashboard-eyebrow">Create Account</p>
            <h2>Join OPTIFOLIO</h2>
            <p>Set up your account and start building your personalized finance workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="dashboard-field-label">Full Name</label>
              <input
                className="dashboard-input"
                placeholder="John Doe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="dashboard-field-label">Email</label>
              <input
                type="email"
                className="dashboard-input"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="dashboard-field-label">Password</label>
              <div className="auth-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  className="dashboard-input"
                  placeholder="Enter a secure password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="auth-password-toggle">
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button type="submit" className="dashboard-primary-button w-full">
              Create Account
            </button>
          </form>

          <p className="auth-footer-text">
            Already have an account?{" "}
            <Link to="/login" className="auth-footer-link">
              Log in
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
};

export default Signup;
