const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// Middleware to verify JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// POST /api/profile/submit
// Save questionnaire answers + computed profiles
router.post("/submit", authMiddleware, async (req, res) => {
  const { answers, investorType, spenderType } = req.body;

  if (!answers || !investorType || !spenderType) {
    return res.status(400).json({ message: "Missing profile data" });
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        profileCompleted: true,
        investorType,
        spenderType,
        profileAnswers: answers,
      },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "Profile saved successfully",
      investorType: user.investorType,
      spenderType: user.spenderType,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/profile
// Fetch the current user's profile
router.get("/", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "name email profileCompleted investorType spenderType profileAnswers"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
