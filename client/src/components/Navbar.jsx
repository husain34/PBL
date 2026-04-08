import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import axios from "axios";

const navItems = [
  { label: "Dashboard", path: "/home", icon: DashboardIcon, group: "main" },
  { label: "Income", path: "/income", icon: IncomeIcon, group: "tracking" },
  { label: "Expenses", path: "/expenses", icon: ExpensesIcon, group: "tracking" },
  { label: "Goals", path: "/goals", icon: GoalsIcon, group: "planning" },
  { label: "Portfolio", path: "/portfolio", icon: PortfolioIcon, group: "planning" },
];

function readStoredUser() {
  const storedUser = localStorage.getItem("user");
  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser);
  } catch {
    localStorage.removeItem("user");
    return null;
  }
}

export default function Navbar({ sidebarCollapsed, onToggleSidebar, theme, onToggleTheme }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(() => readStoredUser());

  const hideOn = ["/", "/login", "/profile-setup"];
  if (hideOn.includes(location.pathname)) return null;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    axios
      .get("http://localhost:5000/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const profile = {
          name: res.data.name,
          email: res.data.email,
          investorType: res.data.investorType,
        };
        setUserProfile(profile);
        localStorage.setItem("user", JSON.stringify(profile));
      })
      .catch(() => {});
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("/login");
  };

  const displayName = userProfile?.name || "User";
  const subtitle = userProfile?.investorType ? `${userProfile.investorType} Investor` : "Optifolio Member";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  return (
    <>
      <header className="mobile-topbar">
        <div className="mobile-topbar-left">
          <button className="mobile-menu-button" onClick={() => setMenuOpen((prev) => !prev)} aria-label="Toggle menu">
            <span />
            <span />
            <span />
          </button>
          <div className="brand-mark">
            <div className="brand-icon">O</div>
            <div>
              <p>OPTIFOLIO</p>
              <span>Investor cockpit</span>
            </div>
          </div>
        </div>

        <div className="mobile-topbar-actions">
          <button className="shell-icon-button" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </header>

      <aside className={`app-sidebar ${menuOpen ? "app-sidebar-open" : ""} ${sidebarCollapsed ? "app-sidebar-collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <span>OP</span>
          </div>
          {!sidebarCollapsed && (
            <div className="sidebar-brand-copy">
              <h2>OPTIFOLIO</h2>
              <p>Portfolio Command</p>
            </div>
          )}
        </div>

        <div className={`sidebar-control-row ${sidebarCollapsed ? "sidebar-control-row-collapsed" : ""}`}>
          <button
            className="shell-icon-button shell-icon-button-inverse"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelOpenIcon /> : <PanelCloseIcon />}
          </button>
          <button
            className="shell-icon-button shell-icon-button-inverse"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>

        <div className="sidebar-main">
          <nav className="sidebar-nav">
            {!sidebarCollapsed && <p className="sidebar-section-label">Tracking</p>}
            {navItems.filter(i => i.group === "main" || i.group === "tracking").map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="sidebar-link-icon">
                    <Icon />
                  </span>
                  {!sidebarCollapsed && <span className="sidebar-link-label">{item.label}</span>}
                </NavLink>
              );
            })}
            {!sidebarCollapsed && <p className="sidebar-section-label" style={{ marginTop: "1rem" }}>Investing</p>}
            {sidebarCollapsed && <div style={{ marginTop: "0.75rem", borderTop: "1px solid hsl(var(--border))", marginBottom: "0.75rem" }} />}
            {navItems.filter(i => i.group === "planning").map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="sidebar-link-icon">
                    <Icon />
                  </span>
                  {!sidebarCollapsed && <span className="sidebar-link-label">{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>

          <div className={`sidebar-account-card ${sidebarCollapsed ? "sidebar-account-card-collapsed" : ""}`}>
            {!sidebarCollapsed && <p className="sidebar-account-label">User Account</p>}

            <div className="sidebar-profile" title={sidebarCollapsed ? displayName : undefined}>
              <div className="profile-badge">{initials}</div>
              {!sidebarCollapsed && (
                <div className="sidebar-profile-copy">
                  <strong>{displayName}</strong>
                  <p>{subtitle}</p>
                </div>
              )}
            </div>

            <button onClick={handleLogout} className="sidebar-logout" title={sidebarCollapsed ? "Logout" : undefined}>
              <LogoutIcon />
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {menuOpen && <button className="sidebar-overlay" onClick={() => setMenuOpen(false)} aria-label="Close menu" />}
    </>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IncomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20V4" />
      <path d="m6 10 6-6 6 6" />
    </svg>
  );
}

function ExpensesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4v16" />
      <path d="m18 14-6 6-6-6" />
    </svg>
  );
}

function GoalsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PortfolioIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3v18h18" />
      <path d="m7 14 4-4 4 4 5-6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H4" />
      <path d="M20 4v16" />
    </svg>
  );
}

function PanelCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m15 12 3-3" />
      <path d="m15 12 3 3" />
    </svg>
  );
}

function PanelOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m18 12-3-3" />
      <path d="m18 12-3 3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  );
}
