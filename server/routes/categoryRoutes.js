const express = require("express");
const jwt = require("jsonwebtoken");
const Category = require("../models/Category");

const router = express.Router();

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

const DEFAULT_CATEGORIES = [
  { name: "Food & Dining", icon: "🍽️", color: "#f59e0b", type: "need" },
  { name: "Housing", icon: "🏠", color: "#3b82f6", type: "need" },
  { name: "Transport", icon: "🚗", color: "#10b981", type: "need" },
  { name: "Healthcare", icon: "🏥", color: "#ef4444", type: "need" },
  { name: "Shopping", icon: "🛍️", color: "#8b5cf6", type: "want" },
  { name: "Entertainment", icon: "🎬", color: "#ec4899", type: "want" },
  { name: "Education", icon: "📚", color: "#06b6d4", type: "need" },
  { name: "Travel", icon: "✈️", color: "#f97316", type: "want" },
  { name: "Utilities", icon: "⚡", color: "#84cc16", type: "need" },
  { name: "Other", icon: "📦", color: "#6b7280", type: "want" },
];

// GET /api/categories — fetch all categories for user, seed defaults if none exist
router.get("/", authMiddleware, async (req, res) => {
  try {
    let categories = await Category.find({ userId: req.userId });

    if (categories.length === 0) {
      const defaults = DEFAULT_CATEGORIES.map((c) => ({
        ...c,
        userId: req.userId,
        isDefault: true,
      }));
      categories = await Category.insertMany(defaults);
    }

    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories — create custom category
router.post("/", authMiddleware, async (req, res) => {
  const { name, icon, color, type } = req.body;
  if (!name) return res.status(400).json({ message: "Name is required" });
  try {
    const category = await Category.create({
      userId: req.userId,
      name,
      icon: icon || "📦",
      color: color || "#6b7280",
      type: type || "want",
      isDefault: false,
    });
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/categories/:id — delete custom category
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const cat = await Category.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
      isDefault: false,
    });
    if (!cat) return res.status(404).json({ message: "Category not found or is a default" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
