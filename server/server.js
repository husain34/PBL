const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
 
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const incomeRoutes = require("./routes/incomeRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const goalRoutes = require("./routes/goalRoutes");
 
const app = express();
 
app.use(cors());
app.use(express.json());
 
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));
 
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/goals", goalRoutes);
 
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));