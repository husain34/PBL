import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Questionnaire from "./pages/Questionnaire";
import IncomePage from "./pages/IncomePage";
import ExpensePage from "./pages/ExpensePage";
import GoalsPage from "./pages/GoalsPage";
import Navbar from "./components/Navbar";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile-setup" element={<Questionnaire />} />
        <Route path="/home" element={<Home />} />
        <Route path="/income" element={<IncomePage />} />
        <Route path="/expenses" element={<ExpensePage />} />
        <Route path="/goals" element={<GoalsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
