const express = require("express");
const jwt = require("jsonwebtoken");
const PortfolioHolding = require("../models/PortfolioHolding");
const User = require("../models/User");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

const router = express.Router();

// Helper for volatility calculation
async function getVolatility(symbol) {
  try {
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    
    const queryOptions = { period1: oneYearAgo, interval: "1wk" };
    const history = await yahooFinance.historical(symbol, queryOptions);
    
    if (!history || history.length < 5) return 0;

    const returns = [];
    for (let i = 1; i < history.length; i++) {
        if (history[i].close && history[i-1].close) {
            returns.push((history[i].close - history[i-1].close) / history[i-1].close);
        }
    }

    if (returns.length === 0) return 0;

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Annualized volatility
    return stdDev * Math.sqrt(52);
  } catch (e) {
    console.error(`Volatility calc failed for ${symbol}:`, e.message);
    return 0;
  }
}

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

// POST /api/portfolio — Add a new holding
router.post("/", authMiddleware, async (req, res) => {
  const { symbol, quantity, avgPrice, purchaseDate, category } = req.body;
  if (!symbol || !quantity || !avgPrice || !purchaseDate || !category)
    return res.status(400).json({ message: "Missing required fields" });

  try {
    // Initial fetch to validate symbol and get company name
    const quote = await yahooFinance.quote(symbol);
    if (!quote) return res.status(404).json({ message: "Stock symbol not found" });

    const holding = await PortfolioHolding.create({
      userId: req.userId,
      symbol: symbol.toUpperCase(),
      companyName: quote.longName || quote.shortName || symbol,
      quantity: Number(quantity),
      avgPrice: Number(avgPrice),
      purchaseDate,
      category,
      lastPrice: quote.regularMarketPrice,
      lastFetched: new Date(),
    });

    res.status(201).json(holding);
  } catch (err) {
    console.error("Add holding error:", err);
    res.status(500).json({ error: "Failed to fetch stock data or add holding" });
  }
});

// Helper to get or update price with 15-min cache
async function getUpdatedHolding(holding, now = new Date()) {
  const isStale = !holding.lastFetched || (now - holding.lastFetched > 15 * 60 * 1000);
  if (isStale) {
    try {
      const quote = await yahooFinance.quote(holding.symbol);
      if (quote && quote.regularMarketPrice !== undefined) {
        holding.lastPrice = quote.regularMarketPrice;
        holding.lastFetched = now;
        if (quote.longName || quote.shortName) {
          holding.companyName = quote.longName || quote.shortName;
        }
        await holding.save();
      }
    } catch (e) {
      console.error(`Cache update failed for ${holding.symbol}:`, e.message);
    }
  }
  return holding;
}

// GET /api/portfolio — Fetch all holdings with price caching
router.get("/", authMiddleware, async (req, res) => {
  try {
    const holdings = await PortfolioHolding.find({ userId: req.userId }).sort({ symbol: 1 });
    const now = new Date();
    
    // Update all in parallel (wrapped in Promise.all for speed)
    const updated = await Promise.all(holdings.map(h => getUpdatedHolding(h, now)));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/portfolio/:id — Edit a holding
router.put("/:id", authMiddleware, async (req, res) => {
  const { quantity, avgPrice, purchaseDate, category } = req.body;
  try {
    const holding = await PortfolioHolding.findOne({ _id: req.params.id, userId: req.userId });
    if (!holding) return res.status(404).json({ message: "Holding not found" });

    if (quantity !== undefined) holding.quantity = Number(quantity);
    if (avgPrice !== undefined) holding.avgPrice = Number(avgPrice);
    if (purchaseDate !== undefined) holding.purchaseDate = purchaseDate;
    if (category !== undefined) holding.category = category;

    await holding.save();
    res.json(holding);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/portfolio/:id — Remove a holding
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const holding = await PortfolioHolding.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!holding) return res.status(404).json({ message: "Holding not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolio/summary — Portfolio statistics
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const holdings = await PortfolioHolding.find({ userId: req.userId });
    const now = new Date();
    
    // Ensure prices are relatively fresh for summary
    const updated = await Promise.all(holdings.map(h => getUpdatedHolding(h, now)));
    
    let totalInvested = 0;
    let currentValue = 0;
    const categoryMap = {};
    const stockReturns = [];

    updated.forEach(h => {
      const invested = h.quantity * h.avgPrice;
      const current = h.quantity * (h.lastPrice || h.avgPrice);
      const pnl = current - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

      totalInvested += invested;
      currentValue += current;

      // Category breakdown
      categoryMap[h.category] = (categoryMap[h.category] || 0) + current;

      // Per-stock return for bar chart
      stockReturns.push({
        symbol: h.symbol,
        returnPct: Number(pnlPct.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        value: Number(current.toFixed(2)),
        volatility: 0 // placeholder for now, calculated next
      });
    });

    // Fetch volatilities for each unique symbol
    const symbols = [...new Set(updated.map(h => h.symbol))];
    const volMap = {};
    await Promise.all(symbols.map(async (s) => {
        volMap[s] = await getVolatility(s);
    }));

    // Assign volatilities and calculate weighted portfolio volatility
    let weightedVolSum = 0;
    stockReturns.forEach(sr => {
        sr.volatility = Number((volMap[sr.symbol] * 100).toFixed(2));
        weightedVolSum += (volMap[sr.symbol] * (sr.value / currentValue));
    });

    const categoryBreakdown = Object.entries(categoryMap).map(([name, total]) => ({
      name,
      total: Number(total.toFixed(2))
    }));

    // Sort stock returns by best performing
    stockReturns.sort((a, b) => b.returnPct - a.returnPct);

    res.json({
      totalInvested: Number(totalInvested.toFixed(2)),
      currentValue: Number(currentValue.toFixed(2)),
      totalPnL: Number((currentValue - totalInvested).toFixed(2)),
      totalReturnPct: totalInvested > 0 ? Number(((currentValue - totalInvested) / totalInvested * 100).toFixed(2)) : 0,
      portfolioVolatility: Number((weightedVolSum * 100).toFixed(2)),
      categoryBreakdown,
      stockReturns
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolio/suggestions — Allocation advice
router.get("/suggestions", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("investorType");
    const investorType = user?.investorType || "Moderate"; // Default to Moderate

    const holdings = await PortfolioHolding.find({ userId: req.userId });
    const currentValue = holdings.reduce((sum, h) => sum + (h.quantity * (h.lastPrice || h.avgPrice)), 0);

    const categoryMap = {};
    holdings.forEach(h => {
      const val = h.quantity * (h.lastPrice || h.avgPrice);
      categoryMap[h.category] = (categoryMap[h.category] || 0) + val;
    });

    const TARGETS = {
      Conservative: { "Large Cap": 40, "Mid Cap": 10, "Small Cap": 0, "Debt": 40, "Other": 10 },
      Moderate: { "Large Cap": 50, "Mid Cap": 20, "Small Cap": 10, "Debt": 15, "Other": 5 },
      Aggressive: { "Large Cap": 40, "Mid Cap": 30, "Small Cap": 25, "Debt": 0, "Other": 5 }
    };

    const target = TARGETS[investorType];
    const categories = ["Large Cap", "Mid Cap", "Small Cap", "Debt", "Other"];
    
    const analysis = categories.map(cat => {
      const currentVal = categoryMap[cat] || 0;
      const currentPct = currentValue > 0 ? (currentVal / currentValue) * 100 : 0;
      const targetPct = target[cat];
      const delta = currentPct - targetPct;
      
      let status = "On Track";
      if (delta > 5) status = "Overweight";
      else if (delta < -5) status = "Underweight";

      return {
        category: cat,
        currentPct: Number(currentPct.toFixed(2)),
        targetPct: Number(targetPct.toFixed(2)),
        delta: Number(delta.toFixed(2)),
        status
      };
    });

    res.json({
      investorType,
      analysis
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
