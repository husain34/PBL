const express = require("express");
const jwt = require("jsonwebtoken");
const PortfolioHolding = require("../models/PortfolioHolding");
const User = require("../models/User");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();
const { getStockCategory: getStockCategoryFromRanking, getCompanyName } = require("../utils/marketCapRanking");

const router = express.Router();

// Helper for volatility calculation
async function getVolatility(symbol) {
  try {
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    
    const queryOptions = { period1: oneYearAgo, period2: now, interval: "1wk" };
    
    try {
      const history = await yahooFinance.historical(symbol, queryOptions);
      
      if (!history || history.length < 5) {
        console.warn(`Not enough historical data for ${symbol}, trying daily data...`);
        // Fallback to using 3 months of daily data
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        const dailyOptions = { period1: threeMonthsAgo, period2: now, interval: "1d" };
        const dailyHistory = await yahooFinance.historical(symbol, dailyOptions);
        
        if (!dailyHistory || dailyHistory.length < 10) {
          console.warn(`Insufficient data for ${symbol}, using estimated volatility`);
          return 0.15; // Default volatility estimate for stocks (15%)
        }
        
        return calculateVolatilityFromHistory(dailyHistory, symbol);
      }
      
      return calculateVolatilityFromHistory(history, symbol);
    } catch (fetchError) {
      console.warn(`Historical fetch failed for ${symbol}:`, fetchError.message);
      // Return default volatility estimate
      return 0.15;
    }
  } catch (e) {
    console.error(`Volatility calc failed for ${symbol}:`, e.message);
    return 0.15; // Default to 15% instead of 0
  }
}

// Helper to calculate volatility from historical data
function calculateVolatilityFromHistory(history, symbol) {
  const returns = [];
  for (let i = 1; i < history.length; i++) {
    if (history[i].close && history[i-1].close) {
      const dailyReturn = (history[i].close - history[i-1].close) / history[i-1].close;
      returns.push(dailyReturn);
    }
  }

  if (returns.length === 0) {
    console.warn(`No valid returns for ${symbol}`);
    return 0.15;
  }

  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  // Annualized volatility (252 trading days for daily data, 52 weeks for weekly)
  const annualizedVolatility = stdDev * Math.sqrt(history.length > 100 ? 252 : 52);
  
  console.log(`Calculated volatility for ${symbol}: ${(annualizedVolatility * 100).toFixed(2)}%`);
  return annualizedVolatility;
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

// Helper to determine stock category based on SEBI official classification
// Uses hardcoded Nifty100, Nifty Midcap150, Nifty Smallcap500 lists
function getStockCategory(symbol) {
  const category = getStockCategoryFromRanking(symbol);
  const company = getCompanyName(symbol);
  if (company) {
    console.log(`Stock ${symbol}: ${company}, Category: ${category}`);
  } else {
    console.warn(`Stock ${symbol}: Not found in database, Category: ${category}`);
  }
  return category;
}

// GET /api/portfolio/stock-category/:symbol — Fetch stock category based on market cap ranking
router.get("/stock-category/:symbol", authMiddleware, async (req, res) => {
  try {
    const { symbol } = req.params;
    const category = getStockCategory(symbol);
    
    // Also fetch company name
    const quote = await yahooFinance.quote(symbol);
    const companyName = quote?.longName || quote?.shortName || symbol;
    
    res.json({ category, companyName, symbol: symbol.toUpperCase() });
  } catch (err) {
    console.error("Stock category fetch error:", err);
    res.status(500).json({ error: "Failed to fetch stock category" });
  }
});


// POST /api/portfolio — Add a new holding
router.post("/", authMiddleware, async (req, res) => {
  const { symbol, quantity, priceBoughtAt, purchaseDate, category } = req.body;
  if (!symbol || !quantity || !priceBoughtAt || !purchaseDate)
    return res.status(400).json({ message: "Missing required fields" });

  try {
    // Validate stock symbol and fetch from Yahoo Finance
    const quote = await yahooFinance.quote(symbol);
    if (!quote) return res.status(404).json({ message: "Stock symbol not found" });

    // If category not provided, auto-fetch it based on market cap ranking
    let finalCategory = category;
    if (!finalCategory) {
      finalCategory = getStockCategory(symbol);
    }

    // Validate category (only equity categories allowed)
    const validCategories = ["Large Cap", "Mid Cap", "Small Cap", "Unclassified"];
    if (finalCategory && !validCategories.includes(finalCategory)) {
      return res.status(400).json({ message: "Invalid category. Only Large Cap, Mid Cap, Small Cap, and Unclassified are supported." });
    }

    const holding = await PortfolioHolding.create({
      userId: req.userId,
      symbol: symbol.toUpperCase(),
      companyName: quote.longName || quote.shortName || symbol,
      quantity: Number(quantity),
      priceBoughtAt: Number(priceBoughtAt),
      purchaseDate,
      category: finalCategory,
      lastPrice: quote.regularMarketPrice,
      lastFetched: new Date(),
    });

    res.status(201).json(holding);
  } catch (err) {
    console.error("Add holding error:", err);
    res.status(500).json({ error: "Failed to fetch stock data. Please check the symbol and try again." });
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
  const { quantity, priceBoughtAt, purchaseDate, category } = req.body;
  try {
    const holding = await PortfolioHolding.findOne({ _id: req.params.id, userId: req.userId });
    if (!holding) return res.status(404).json({ message: "Holding not found" });

    if (quantity !== undefined) holding.quantity = Number(quantity);
    if (priceBoughtAt !== undefined) holding.priceBoughtAt = Number(priceBoughtAt);
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
      const invested = h.quantity * h.priceBoughtAt;
      const current = h.quantity * (h.lastPrice || h.priceBoughtAt);
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



    const categoryBreakdown = Object.entries(categoryMap).map(([name, total]) => ({
      name,
      total: Number(total.toFixed(2))
    }));

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
    const currentValue = holdings.reduce((sum, h) => sum + (h.quantity * (h.lastPrice || h.priceBoughtAt)), 0);

    const categoryMap = {};
    holdings.forEach(h => {
      const val = h.quantity * (h.lastPrice || h.priceBoughtAt);
      categoryMap[h.category] = (categoryMap[h.category] || 0) + val;
    });

    const TARGETS = {
      Conservative: { "Large Cap": 60, "Mid Cap": 30, "Small Cap": 10 },
      Moderate: { "Large Cap": 50, "Mid Cap": 35, "Small Cap": 15 },
      Aggressive: { "Large Cap": 40, "Mid Cap": 40, "Small Cap": 20 }
    };

    const target = TARGETS[investorType];
    const categories = ["Large Cap", "Mid Cap", "Small Cap"];
    
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
