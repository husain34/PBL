import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "../api/axios";

const quickStats = [
  { label: "Tracked", value: "24/7" },
  { label: "Clarity", value: "1 dashboard" },
  { label: "Guidance", value: "Personalized" },
];

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post("/auth/login", form);
      localStorage.setItem("token", res.data.token);

      const profileRes = await axios.get("/profile", {
        headers: { Authorization: `Bearer ${res.data.token}` },
      });

      localStorage.setItem(
        "user",
        JSON.stringify({
          name: profileRes.data.name || res.data.user?.name,
          email: profileRes.data.email || res.data.user?.email,
          investorType: profileRes.data.investorType || "",
        })
      );

      if (profileRes.data.profileCompleted) {
        window.location.replace("/income");
      } else {
        window.location.replace("/profile-setup");
      }
    } catch (error) {
      alert(error.response?.data?.message || "Login failed");
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-backdrop auth-backdrop-login" />

      <section className="auth-showcase">
        <p className="dashboard-eyebrow">Welcome Back</p>
        <h1 className="auth-showcase-title">Step back into your financial command center.</h1>
        <p className="auth-showcase-copy">
          Log in to review your dashboard, continue planning, and keep every money decision visible and organized.
        </p>

        <div className="auth-stats-grid">
          {quickStats.map((stat) => (
            <div key={stat.label} className="auth-stat-card">
              <p>{stat.label}</p>
              <h3>{stat.value}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-card">
          <div className="auth-form-header">
            <p className="dashboard-eyebrow">Sign In</p>
            <h2>Log In to OPTIFOLIO</h2>
            <p>Pick up where you left off and continue with your personalized experience.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="dashboard-field-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="dashboard-input"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="dashboard-field-label">
                Password
              </label>
              <div className="auth-password-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="dashboard-input"
                  placeholder="Enter your password"
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
              Log In
            </button>
          </form>

          <p className="auth-footer-text">
            Don&apos;t have an account?{" "}
            <Link to="/" className="auth-footer-link">
              Sign up
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
};

export default Login;
