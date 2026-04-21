import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Questionnaire from "./pages/Questionnaire";
import IncomePage from "./pages/IncomePage";
import ExpensePage from "./pages/ExpensePage";
import GoalsPage from "./pages/GoalsPage";
import PortfolioPage from "./pages/PortfolioPage";
import Navbar from "./components/Navbar";

function AppLayout() {
  const location = useLocation();
  const authlessRoutes = ["/", "/login", "/profile-setup"];
  const isAuthlessRoute = authlessRoutes.includes(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("optifolioSidebar") === "collapsed");
  const [theme, setTheme] = useState(() => localStorage.getItem("optifolioTheme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("optifolioTheme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("optifolioSidebar", sidebarCollapsed ? "collapsed" : "expanded");
  }, [sidebarCollapsed]);

  return (
    <>
      <Navbar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
      />
      <main className={isAuthlessRoute ? "" : `app-content ${sidebarCollapsed ? "app-content-collapsed" : ""}`}>
        <Routes>
          <Route path="/" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile-setup" element={<Questionnaire />} />
          <Route path="/income" element={<IncomePage />} />
          <Route path="/expenses" element={<ExpensePage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
        </Routes>
      </main>
      {!isAuthlessRoute && <QuickAddFab />}
    </>
  );
}

function QuickAddFab() {
  const [open, setOpen] = useState(false);

  return (
    <div className="quick-add-fab-wrap">
      {open && (
        <div className="quick-add-fab-menu">
          <Link to="/income" className="quick-add-fab-item" onClick={() => setOpen(false)}>
            Add income
          </Link>
          <Link to="/expenses" className="quick-add-fab-item" onClick={() => setOpen(false)}>
            Add expense
          </Link>
          <Link to="/goals" className="quick-add-fab-item" onClick={() => setOpen(false)}>
            Add goal
          </Link>
        </div>
      )}
      <button className="quick-add-fab" onClick={() => setOpen((prev) => !prev)} aria-label="Quick add">
        {open ? "x" : "+"}
      </button>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
