const express = require("express");
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

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

router.get("/", authMiddleware, async (req, res) => {
  try {
    let { data: categories, error } = await supabase
      .from("categories")
      .select()
      .eq("user_id", req.userId);

    if (error) throw error;

    if (!categories || categories.length === 0) {
      const defaults = DEFAULT_CATEGORIES.map((c) => ({
        ...c,
        user_id: req.userId,
        is_default: true,
      }));
      
      const { data: inserted, error: insertError } = await supabase
        .from("categories")
        .insert(defaults)
        .select();
        
      if (insertError) throw insertError;
      categories = inserted;
    }

    const formatted = categories.map(c => ({
      ...c,
      _id: c.id,
      userId: c.user_id,
      isDefault: c.is_default
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const { name, icon, color, type } = req.body;
  if (!name) return res.status(400).json({ message: "Name is required" });
  try {
    const { data: category, error } = await supabase
      .from("categories")
      .insert({
        user_id: req.userId,
        name,
        icon: icon || "📦",
        color: color || "#6b7280",
        type: type || "want",
        is_default: false,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      ...category,
      _id: category.id,
      userId: category.user_id,
      isDefault: category.is_default
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .eq("is_default", false);

    if (error) throw error;
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
