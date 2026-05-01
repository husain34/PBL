const express = require("express");

const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const incomeRoutes = require("./routes/incomeRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const goalRoutes = require("./routes/goalRoutes");
const portfolioRoutes = require("./routes/portfolioRoutes");

// Ensure models are registered (removed for Supabase migration)

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,        // e.g. https://your-app.vercel.app
  "http://localhost:5173",
  "http://localhost:4173",
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// Supabase is initialized in config/supabase.js, no need to connect here


app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/portfolio", portfolioRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));