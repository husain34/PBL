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

// Helper for Beta calculation from Yahoo Finance
async function getBeta(symbol) {
  try {
    const quote = await yahooFinance.quote(symbol);
    if (quote && quote.beta !== undefined && quote.beta !== null) {
      console.log(`Beta for ${symbol}: ${quote.beta}`);
      return quote.beta;
    }
    console.warn(`Beta not available for ${symbol}, defaulting to 1.0`);
    return 1.0;
  } catch (e) {
    console.error(`Beta fetch failed for ${symbol}:`, e.message);
    return 1.0;
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

    // Fetch betas for portfolio beta calculation
    const betaMap = {};
    await Promise.all(symbols.map(async (s) => {
      betaMap[s] = await getBeta(s);
    }));

    let weightedBetaSum = 0;
    stockReturns.forEach(sr => {
      sr.beta = Number((betaMap[sr.symbol] || 1.0).toFixed(2));
      weightedBetaSum += (betaMap[sr.symbol] || 1.0) * (sr.value / currentValue);
    });

    res.json({
      totalInvested: Number(totalInvested.toFixed(2)),
      currentValue: Number(currentValue.toFixed(2)),
      totalPnL: Number((currentValue - totalInvested).toFixed(2)),
      totalReturnPct: totalInvested > 0 ? Number(((currentValue - totalInvested) / totalInvested * 100).toFixed(2)) : 0,
      portfolioVolatility: Number((weightedVolSum * 100).toFixed(2)),
      portfolioBeta: Number(weightedBetaSum.toFixed(2)),
      categoryBreakdown,
      stockReturns
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolio/suggestions — Allocation advice + Rebalance Plan
router.get("/suggestions", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("investorType");
    const investorType = user?.investorType || "Moderate";

    const holdings = await PortfolioHolding.find({ userId: req.userId });
    const now = new Date();
    const updated = await Promise.all(holdings.map(h => getUpdatedHolding(h, now)));

    const currentValue = updated.reduce((sum, h) => sum + (h.quantity * (h.lastPrice || h.priceBoughtAt)), 0);

    // Group by category
    const categoryMap = {};
    const categoryHoldings = {};
    updated.forEach(h => {
      const val = h.quantity * (h.lastPrice || h.priceBoughtAt);
      const invested = h.quantity * h.priceBoughtAt;
      const pnl = val - invested;
      const returnPct = invested > 0 ? (pnl / invested) * 100 : 0;

      categoryMap[h.category] = (categoryMap[h.category] || 0) + val;
      if (!categoryHoldings[h.category]) categoryHoldings[h.category] = [];
      categoryHoldings[h.category].push({
        symbol: h.symbol,
        companyName: h.companyName,
        value: Number(val.toFixed(2)),
        invested: Number(invested.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        returnPct: Number(returnPct.toFixed(2)),
        quantity: h.quantity,
        lastPrice: h.lastPrice || h.priceBoughtAt
      });
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
      const targetVal = (targetPct / 100) * currentValue;
      const delta = currentPct - targetPct;
      const deltaAmount = currentVal - targetVal;
      
      let status = "On Track";
      if (delta > 5) status = "Overweight";
      else if (delta < -5) status = "Underweight";

      return {
        category: cat,
        currentPct: Number(currentPct.toFixed(2)),
        currentVal: Number(currentVal.toFixed(2)),
        targetPct: Number(targetPct.toFixed(2)),
        targetVal: Number(targetVal.toFixed(2)),
        delta: Number(delta.toFixed(2)),
        deltaAmount: Number(deltaAmount.toFixed(2)),
        status
      };
    });

    // === Rebalance Plan ===
    const rebalancePlan = [];
    const sellActions = [];
    const buyActions = [];

    // Identify overweight (sell) and underweight (buy) categories
    const overweight = analysis.filter(a => a.status === "Overweight");
    const underweight = analysis.filter(a => a.status === "Underweight");

    // For overweight categories: suggest which stocks to sell
    // Prioritize selling OVER-PERFORMING stocks to lock in gains
    overweight.forEach(ow => {
      const sellAmount = Math.abs(ow.deltaAmount);
      const stocks = (categoryHoldings[ow.category] || [])
        .sort((a, b) => b.returnPct - a.returnPct); // best performers first (lock gains)

      let remaining = sellAmount;
      const stockSells = [];

      for (const stock of stocks) {
        if (remaining <= 0) break;
        const sellFromThis = Math.min(remaining, stock.value * 0.6); // max 60% of any single stock
        const sellQty = Math.ceil(sellFromThis / stock.lastPrice);
        const actualSellAmount = sellQty * stock.lastPrice;

        stockSells.push({
          symbol: stock.symbol,
          companyName: stock.companyName,
          sellQuantity: sellQty,
          sellAmount: Number(actualSellAmount.toFixed(2)),
          currentReturn: stock.returnPct,
          reason: stock.returnPct > 0 
            ? `Lock in ${stock.returnPct.toFixed(1)}% gains`
            : `Reduce overweight exposure`
        });

        remaining -= actualSellAmount;
      }

      sellActions.push({
        category: ow.category,
        totalSellAmount: Number(sellAmount.toFixed(2)),
        excessPct: ow.delta,
        stocks: stockSells
      });

      rebalancePlan.push({
        action: "SELL",
        category: ow.category,
        amount: Number(sellAmount.toFixed(2)),
        fromPct: ow.currentPct,
        toPct: ow.targetPct,
        description: `Sell ₹${Math.round(sellAmount).toLocaleString("en-IN")} of ${ow.category}`
      });
    });

    // For underweight categories: suggest where to buy
    const totalSellAmount = sellActions.reduce((sum, s) => sum + s.totalSellAmount, 0);

    underweight.forEach(uw => {
      const buyAmount = Math.abs(uw.deltaAmount);
      // Proportional allocation from sell proceeds
      const allocatedBuy = totalSellAmount > 0 
        ? Math.min(buyAmount, totalSellAmount * (buyAmount / underweight.reduce((s, u) => s + Math.abs(u.deltaAmount), 0)))
        : buyAmount;

      buyActions.push({
        category: uw.category,
        totalBuyAmount: Number(allocatedBuy.toFixed(2)),
        deficitPct: Math.abs(uw.delta),
        suggestion: `Add ${uw.category} stocks to reach ${uw.targetPct}% allocation`
      });

      rebalancePlan.push({
        action: "BUY",
        category: uw.category,
        amount: Number(allocatedBuy.toFixed(2)),
        fromPct: uw.currentPct,
        toPct: uw.targetPct,
        description: `Buy ₹${Math.round(allocatedBuy).toLocaleString("en-IN")} of ${uw.category}`
      });
    });

    res.json({
      investorType,
      totalPortfolioValue: Number(currentValue.toFixed(2)),
      analysis,
      rebalancePlan,
      sellActions,
      buyActions,
      summary: rebalancePlan.map(r => r.description).join(" → ")
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolio/risk-analysis — Full Risk Engine analysis
router.get("/risk-analysis", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("investorType");
    const investorType = user?.investorType || "Moderate";

    const holdings = await PortfolioHolding.find({ userId: req.userId });
    if (!holdings.length) {
      return res.json({
        investorType,
        portfolioVolatility: 0,
        portfolioWeightedBeta: 0,
        targetBetaRange: { min: 0, max: 0 },
        riskRating: "N/A",
        holdings: [],
        inconsistencies: [],
        rebalanceSuggestions: [],
        projectedBetaAfterRebalance: 0
      });
    }

    const now = new Date();
    const updated = await Promise.all(holdings.map(h => getUpdatedHolding(h, now)));

    const currentValue = updated.reduce((sum, h) => sum + (h.quantity * (h.lastPrice || h.priceBoughtAt)), 0);

    // Profile-based thresholds
    const BETA_THRESHOLDS = {
      Conservative: 1.2,
      Moderate: 1.5,
      Aggressive: Infinity // no flagging
    };
    const TARGET_BETA = {
      Conservative: { min: 0.5, max: 0.8 },
      Moderate: { min: 0.8, max: 1.0 },
      Aggressive: { min: 1.0, max: 1.5 }
    };

    const betaThreshold = BETA_THRESHOLDS[investorType] || 1.5;
    const targetRange = TARGET_BETA[investorType] || TARGET_BETA.Moderate;

    // Fetch volatility and beta for each unique symbol
    const symbols = [...new Set(updated.map(h => h.symbol))];
    const volMap = {};
    const betaMap = {};
    await Promise.all(symbols.map(async (s) => {
      volMap[s] = await getVolatility(s);
      betaMap[s] = await getBeta(s);
    }));

    // Build per-holding analysis
    let weightedVolSum = 0;
    let weightedBetaSum = 0;
    const holdingAnalysis = updated.map(h => {
      const value = h.quantity * (h.lastPrice || h.priceBoughtAt);
      const weight = currentValue > 0 ? (value / currentValue) * 100 : 0;
      const beta = betaMap[h.symbol] || 1.0;
      const volatility = volMap[h.symbol] || 0.15;

      weightedVolSum += volatility * (value / currentValue);
      weightedBetaSum += beta * (value / currentValue);

      const flagged = beta > betaThreshold;

      return {
        symbol: h.symbol,
        companyName: h.companyName,
        category: h.category,
        weight: Number(weight.toFixed(2)),
        beta: Number(beta.toFixed(2)),
        volatility: Number((volatility * 100).toFixed(2)),
        value: Number(value.toFixed(2)),
        flagged,
        reason: flagged ? `Beta ${beta.toFixed(2)} exceeds ${investorType} threshold of ${betaThreshold}` : null
      };
    });

    const portfolioVolatility = Number((weightedVolSum * 100).toFixed(2));
    const portfolioWeightedBeta = Number(weightedBetaSum.toFixed(2));

    // Determine risk rating
    let riskRating = "Low";
    if (portfolioWeightedBeta > targetRange.max + 0.3) riskRating = "High";
    else if (portfolioWeightedBeta > targetRange.max) riskRating = "Moderate";

    // Flag inconsistencies
    const inconsistencies = holdingAnalysis.filter(h => h.flagged);

    // Calculate rebalancing suggestions
    const rebalanceSuggestions = [];
    let totalTrimAmount = 0;

    if (inconsistencies.length > 0 && portfolioWeightedBeta > targetRange.max) {
      // How much beta overshoot do we have?
      const betaOvershoot = portfolioWeightedBeta - targetRange.max;
      
      inconsistencies.forEach(h => {
        // Trim proportional to how much the stock's beta exceeds the threshold
        const betaExcess = h.beta - betaThreshold;
        const maxTrim = 60; // never suggest trimming more than 60%
        const minTrim = 15; // always suggest at least 15% trim
        let trimPct = Math.round(Math.min(maxTrim, Math.max(minTrim, (betaExcess / h.beta) * 100 + betaOvershoot * 20)));
        
        const trimAmount = Number(((h.value * trimPct) / 100).toFixed(2));
        totalTrimAmount += trimAmount;

        h.suggestedTrimPct = trimPct;
        h.trimAmount = trimAmount;

        rebalanceSuggestions.push({
          action: "TRIM",
          symbol: h.symbol,
          companyName: h.companyName,
          trimPct,
          amount: trimAmount,
          reason: h.reason
        });
      });

      // Suggest where to allocate the trimmed capital
      rebalanceSuggestions.push({
        action: "ALLOCATE",
        target: "Nifty 50 Index ETF (e.g., NIFTYBEES.NS)",
        amount: Number((totalTrimAmount * 0.6).toFixed(2)),
        reason: "Low-cost index exposure with beta ≈ 1.0 and lower individual stock risk"
      });
      rebalanceSuggestions.push({
        action: "ALLOCATE",
        target: "Blue-Chip Large Caps (HDFCBANK, INFY, TCS, ITC)",
        amount: Number((totalTrimAmount * 0.4).toFixed(2)),
        reason: "Stable large-cap stocks with historically lower volatility"
      });
    }

    // Calculate projected beta after rebalance
    let projectedBeta = portfolioWeightedBeta;
    if (inconsistencies.length > 0 && currentValue > 0) {
      let newWeightedBeta = 0;
      let newTotalValue = currentValue;
      holdingAnalysis.forEach(h => {
        if (h.flagged && h.suggestedTrimPct) {
          const remainingValue = h.value * (1 - h.suggestedTrimPct / 100);
          newWeightedBeta += h.beta * remainingValue;
        } else {
          newWeightedBeta += h.beta * h.value;
        }
      });
      // Add back trimmed amount at assumed beta of ~0.85 (index + blue-chip blend)
      newWeightedBeta += 0.85 * totalTrimAmount;
      projectedBeta = Number((newWeightedBeta / newTotalValue).toFixed(2));
    }

    res.json({
      investorType,
      portfolioVolatility,
      portfolioWeightedBeta,
      targetBetaRange: targetRange,
      riskRating,
      holdings: holdingAnalysis,
      inconsistencies,
      rebalanceSuggestions,
      projectedBetaAfterRebalance: projectedBeta
    });
  } catch (err) {
    console.error("Risk analysis error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: get sector for a stock from Yahoo Finance
async function getStockSector(symbol) {
  try {
    const result = await yahooFinance.quoteSummary(symbol, { modules: ["assetProfile"] });
    if (result?.assetProfile?.sector) {
      return result.assetProfile.sector;
    }
    return "Unknown";
  } catch (e) {
    console.warn(`Sector fetch failed for ${symbol}:`, e.message);
    // Fallback mapping for common Indian stocks
    const FALLBACK_SECTORS = {
      "HDFCBANK.NS": "Financials", "ICICIBANK.NS": "Financials", "SBIN.NS": "Financials",
      "KOTAKBANK.NS": "Financials", "AXISBANK.NS": "Financials", "BAJFINANCE.NS": "Financials",
      "TCS.NS": "Technology", "INFY.NS": "Technology", "WIPRO.NS": "Technology",
      "HCLTECH.NS": "Technology", "TECHM.NS": "Technology", "LTM.NS": "Technology",
      "RELIANCE.NS": "Energy", "ONGC.NS": "Energy", "BPCL.NS": "Energy",
      "IOC.NS": "Energy", "ADANIGREEN.NS": "Energy", "ADANIPOWER.NS": "Energy",
      "TATAMOTORS.NS": "Consumer Cyclical", "MARUTI.NS": "Consumer Cyclical",
      "EICHERMOT.NS": "Consumer Cyclical", "BAJAJ-AUTO.NS": "Consumer Cyclical",
      "ITC.NS": "Consumer Defensive", "HINDUNILVR.NS": "Consumer Defensive",
      "NESTLEIND.NS": "Consumer Defensive", "BRITANNIA.NS": "Consumer Defensive",
      "SUNPHARMA.NS": "Healthcare", "DRREDDY.NS": "Healthcare", "CIPLA.NS": "Healthcare",
      "DIVISLAB.NS": "Healthcare", "APOLLOHOSP.NS": "Healthcare",
      "TATASTEEL.NS": "Basic Materials", "JSWSTEEL.NS": "Basic Materials",
      "HINDALCO.NS": "Basic Materials", "VEDL.NS": "Basic Materials",
      "ADANIENT.NS": "Industrials", "LT.NS": "Industrials", "HAL.NS": "Industrials",
      "NTPC.NS": "Utilities", "POWERGRID.NS": "Utilities", "TATAPOWER.NS": "Utilities",
      "BHARTIARTL.NS": "Communication Services", "TITAN.NS": "Consumer Cyclical",
      "ASIANPAINT.NS": "Basic Materials", "DLF.NS": "Real Estate",
    };
    return FALLBACK_SECTORS[symbol.toUpperCase()] || "Unknown";
  }
}

// All standard sectors for diversification analysis
const ALL_SECTORS = [
  "Technology", "Financials", "Healthcare", "Energy",
  "Consumer Cyclical", "Consumer Defensive", "Industrials",
  "Basic Materials", "Utilities", "Real Estate", "Communication Services"
];

// Sector correlation mapping — which sectors are uncorrelated to each other
const UNCORRELATED_SECTORS = {
  "Technology": ["Healthcare", "Consumer Defensive", "Utilities"],
  "Financials": ["Healthcare", "Technology", "Utilities"],
  "Healthcare": ["Technology", "Energy", "Financials"],
  "Energy": ["Technology", "Healthcare", "Consumer Defensive"],
  "Consumer Cyclical": ["Healthcare", "Utilities", "Consumer Defensive"],
  "Consumer Defensive": ["Technology", "Energy", "Consumer Cyclical"],
  "Industrials": ["Healthcare", "Consumer Defensive", "Technology"],
  "Basic Materials": ["Technology", "Healthcare", "Consumer Defensive"],
  "Utilities": ["Technology", "Consumer Cyclical", "Financials"],
  "Real Estate": ["Technology", "Healthcare", "Energy"],
  "Communication Services": ["Healthcare", "Energy", "Utilities"],
};

// GET /api/portfolio/sector-analysis — Sector exposure & concentration analysis
router.get("/sector-analysis", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("investorType");
    const investorType = user?.investorType || "Moderate";

    const holdings = await PortfolioHolding.find({ userId: req.userId });
    if (!holdings.length) {
      return res.json({
        investorType,
        totalValue: 0,
        sectorBreakdown: [],
        concentrationWarnings: [],
        missingSectors: ALL_SECTORS,
        diversificationSuggestion: null,
        diversificationScore: 0
      });
    }

    const now = new Date();
    const updated = await Promise.all(holdings.map(h => getUpdatedHolding(h, now)));

    const currentValue = updated.reduce((sum, h) => sum + (h.quantity * (h.lastPrice || h.priceBoughtAt)), 0);

    // Fetch sectors for each unique symbol
    const symbols = [...new Set(updated.map(h => h.symbol))];
    const sectorMap = {};
    await Promise.all(symbols.map(async (s) => {
      sectorMap[s] = await getStockSector(s);
    }));

    // Group holdings by sector
    const sectorValues = {};
    const sectorHoldings = {};
    updated.forEach(h => {
      const sector = sectorMap[h.symbol] || "Unknown";
      const value = h.quantity * (h.lastPrice || h.priceBoughtAt);
      sectorValues[sector] = (sectorValues[sector] || 0) + value;
      if (!sectorHoldings[sector]) sectorHoldings[sector] = [];
      sectorHoldings[sector].push({
        symbol: h.symbol,
        companyName: h.companyName,
        value: Number(value.toFixed(2)),
        weight: Number(((value / currentValue) * 100).toFixed(2))
      });
    });

    // Build sector breakdown sorted by value
    const sectorBreakdown = Object.entries(sectorValues)
      .map(([sector, value]) => ({
        sector,
        value: Number(value.toFixed(2)),
        percentage: Number(((value / currentValue) * 100).toFixed(2)),
        holdings: sectorHoldings[sector] || []
      }))
      .sort((a, b) => b.value - a.value);

    // Detect concentration warnings (>30%)
    const concentrationWarnings = sectorBreakdown
      .filter(s => s.percentage > 30)
      .map(s => ({
        sector: s.sector,
        percentage: s.percentage,
        severity: s.percentage > 50 ? "Critical" : "Warning",
        message: s.percentage > 50
          ? `${s.sector} accounts for ${s.percentage}% of your portfolio — critical overconcentration!`
          : `${s.sector} accounts for ${s.percentage}% — consider reducing to below 30% for better diversification.`
      }));

    // Find missing sectors
    const presentSectors = new Set(sectorBreakdown.map(s => s.sector));
    const missingSectors = ALL_SECTORS.filter(s => !presentSectors.has(s));

    // Generate diversification suggestion
    let diversificationSuggestion = null;
    if (concentrationWarnings.length > 0) {
      const heaviestSector = sectorBreakdown[0].sector;
      const uncorrelated = UNCORRELATED_SECTORS[heaviestSector] || ["Healthcare", "Technology"];

      // Find the best uncorrelated sector the user is missing or underweight in
      let targetSector = uncorrelated.find(s => missingSectors.includes(s));
      if (!targetSector) {
        // Pick the uncorrelated sector with lowest current allocation
        targetSector = uncorrelated.reduce((best, s) => {
          const current = sectorBreakdown.find(sb => sb.sector === s);
          const bestCurrent = sectorBreakdown.find(sb => sb.sector === best);
          const currentPct = current ? current.percentage : 0;
          const bestPct = bestCurrent ? bestCurrent.percentage : 0;
          return currentPct < bestPct ? s : best;
        }, uncorrelated[0]);
      }

      const excessPct = sectorBreakdown[0].percentage - 25; // target 25% max
      const shiftPct = Math.min(15, Math.round(excessPct / 2));

      diversificationSuggestion = {
        fromSector: heaviestSector,
        toSector: targetSector,
        shiftPercentage: shiftPct,
        shiftAmount: Number(((currentValue * shiftPct) / 100).toFixed(2)),
        reason: `Your portfolio is heavy in ${heaviestSector}. ${targetSector} has low correlation with ${heaviestSector}, making it an ideal hedge to reduce concentration risk.`,
        exampleStocks: getExampleStocksForSector(targetSector)
      };
    }

    // Calculate diversification score (0-100)
    // Based on: number of sectors, evenness of distribution (Herfindahl index)
    const sectorWeights = sectorBreakdown.map(s => s.percentage / 100);
    const herfindahl = sectorWeights.reduce((sum, w) => sum + w * w, 0);
    const numSectors = sectorBreakdown.filter(s => s.sector !== "Unknown").length;
    const diversificationScore = Math.round(
      Math.min(100, (1 - herfindahl) * 80 + Math.min(numSectors / 6, 1) * 20)
    );

    res.json({
      investorType,
      totalValue: Number(currentValue.toFixed(2)),
      sectorBreakdown,
      top3Sectors: sectorBreakdown.slice(0, 3),
      concentrationWarnings,
      missingSectors,
      diversificationSuggestion,
      diversificationScore
    });
  } catch (err) {
    console.error("Sector analysis error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: example stocks for a sector
function getExampleStocksForSector(sector) {
  const SECTOR_EXAMPLES = {
    "Technology": ["TCS.NS", "INFY.NS", "WIPRO.NS"],
    "Financials": ["HDFCBANK.NS", "ICICIBANK.NS", "BAJFINANCE.NS"],
    "Healthcare": ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS"],
    "Energy": ["RELIANCE.NS", "ONGC.NS", "BPCL.NS"],
    "Consumer Cyclical": ["TITAN.NS", "MARUTI.NS", "TATAMOTORS.NS"],
    "Consumer Defensive": ["ITC.NS", "HINDUNILVR.NS", "NESTLEIND.NS"],
    "Industrials": ["LT.NS", "HAL.NS", "SIEMENS.NS"],
    "Basic Materials": ["TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS"],
    "Utilities": ["NTPC.NS", "POWERGRID.NS", "TATAPOWER.NS"],
    "Real Estate": ["DLF.NS", "GODREJPROP.NS", "OBEROIRLTY.NS"],
    "Communication Services": ["BHARTIARTL.NS", "IDEA.NS"],
  };
  return SECTOR_EXAMPLES[sector] || [];
}

// Helper: get industry + sub-industry from Yahoo Finance
async function getStockIndustry(symbol) {
  try {
    const result = await yahooFinance.quoteSummary(symbol, { modules: ["assetProfile"] });
    const profile = result?.assetProfile;
    return {
      industry: profile?.industry || "Unknown",
      sector: profile?.sector || "Unknown"
    };
  } catch (e) {
    // Fallback mapping for common Indian stocks
    const FALLBACK = {
      "HDFCBANK.NS": { industry: "Banks—Diversified", sector: "Financials" },
      "ICICIBANK.NS": { industry: "Banks—Diversified", sector: "Financials" },
      "SBIN.NS": { industry: "Banks—Diversified", sector: "Financials" },
      "KOTAKBANK.NS": { industry: "Banks—Diversified", sector: "Financials" },
      "AXISBANK.NS": { industry: "Banks—Diversified", sector: "Financials" },
      "BAJFINANCE.NS": { industry: "Credit Services", sector: "Financials" },
      "TCS.NS": { industry: "Information Technology Services", sector: "Technology" },
      "INFY.NS": { industry: "Information Technology Services", sector: "Technology" },
      "WIPRO.NS": { industry: "Information Technology Services", sector: "Technology" },
      "HCLTECH.NS": { industry: "Information Technology Services", sector: "Technology" },
      "TECHM.NS": { industry: "Information Technology Services", sector: "Technology" },
      "RELIANCE.NS": { industry: "Oil & Gas Refining & Marketing", sector: "Energy" },
      "ONGC.NS": { industry: "Oil & Gas E&P", sector: "Energy" },
      "TATAMOTORS.NS": { industry: "Auto Manufacturers", sector: "Consumer Cyclical" },
      "MARUTI.NS": { industry: "Auto Manufacturers", sector: "Consumer Cyclical" },
      "BAJAJ-AUTO.NS": { industry: "Auto Manufacturers", sector: "Consumer Cyclical" },
      "EICHERMOT.NS": { industry: "Auto Manufacturers", sector: "Consumer Cyclical" },
      "ITC.NS": { industry: "Tobacco", sector: "Consumer Defensive" },
      "HINDUNILVR.NS": { industry: "Household & Personal Products", sector: "Consumer Defensive" },
      "SUNPHARMA.NS": { industry: "Drug Manufacturers", sector: "Healthcare" },
      "DRREDDY.NS": { industry: "Drug Manufacturers", sector: "Healthcare" },
      "CIPLA.NS": { industry: "Drug Manufacturers", sector: "Healthcare" },
      "TATASTEEL.NS": { industry: "Steel", sector: "Basic Materials" },
      "JSWSTEEL.NS": { industry: "Steel", sector: "Basic Materials" },
      "HINDALCO.NS": { industry: "Aluminum", sector: "Basic Materials" },
      "ADANIENT.NS": { industry: "Infrastructure Operations", sector: "Industrials" },
      "ADANIPOWER.NS": { industry: "Utilities—Independent Power Producers", sector: "Utilities" },
      "ADANIGREEN.NS": { industry: "Utilities—Renewable", sector: "Utilities" },
      "LT.NS": { industry: "Engineering & Construction", sector: "Industrials" },
      "NTPC.NS": { industry: "Utilities—Independent Power Producers", sector: "Utilities" },
      "TITAN.NS": { industry: "Luxury Goods", sector: "Consumer Cyclical" },
    };
    return FALLBACK[symbol.toUpperCase()] || { industry: "Unknown", sector: "Unknown" };
  }
}

// Uncorrelated alternative assets
const UNCORRELATED_ALTERNATIVES = [
  {
    name: "Gold ETFs",
    examples: ["GOLDBEES.NS", "GOLDCASE.NS"],
    reason: "Gold has historically low correlation with equities and acts as a hedge during market downturns."
  },
  {
    name: "International Tech / US Exposure",
    examples: ["MAFANG.NS (Mirae Asset NYSE FANG+ ETF)", "MON100.NS (Motilal Oswal Nasdaq 100)"],
    reason: "International diversification reduces country-specific regulatory and economic risk."
  },
  {
    name: "Government Bonds / Debt Funds",
    examples: ["LIQUIDBEES.NS", "CPSEETF.NS"],
    reason: "Fixed-income assets provide stable returns and act as a portfolio shock absorber."
  },
  {
    name: "REITs",
    examples: ["EMBASSY.NS", "MINDSPACE.NS"],
    reason: "Real estate investment trusts provide exposure to property markets with low equity correlation."
  }
];

// GET /api/portfolio/correlation-audit — Industry cluster analysis
router.get("/correlation-audit", authMiddleware, async (req, res) => {
  try {
    const holdings = await PortfolioHolding.find({ userId: req.userId });
    if (!holdings.length) {
      return res.json({ clusters: [], redundancies: [], suggestions: [], totalRedundantValue: 0 });
    }

    const now = new Date();
    const updated = await Promise.all(holdings.map(h => getUpdatedHolding(h, now)));
    const currentValue = updated.reduce((sum, h) => sum + (h.quantity * (h.lastPrice || h.priceBoughtAt)), 0);

    // Fetch industry data for each unique symbol
    const symbols = [...new Set(updated.map(h => h.symbol))];
    const industryMap = {};
    await Promise.all(symbols.map(async (s) => {
      industryMap[s] = await getStockIndustry(s);
    }));

    // Group by industry
    const industryGroups = {};
    updated.forEach(h => {
      const { industry, sector } = industryMap[h.symbol] || { industry: "Unknown", sector: "Unknown" };
      const value = h.quantity * (h.lastPrice || h.priceBoughtAt);
      const invested = h.quantity * h.priceBoughtAt;
      const pnl = value - invested;
      const returnPct = invested > 0 ? (pnl / invested) * 100 : 0;

      if (!industryGroups[industry]) {
        industryGroups[industry] = { industry, sector, stocks: [], totalValue: 0 };
      }
      industryGroups[industry].stocks.push({
        symbol: h.symbol,
        companyName: h.companyName,
        value: Number(value.toFixed(2)),
        invested: Number(invested.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        returnPct: Number(returnPct.toFixed(2)),
        weight: Number(((value / currentValue) * 100).toFixed(2))
      });
      industryGroups[industry].totalValue += value;
    });

    // Find clusters (2+ stocks in same industry)
    const clusters = Object.values(industryGroups)
      .filter(g => g.stocks.length >= 2)
      .map(g => ({
        ...g,
        totalValue: Number(g.totalValue.toFixed(2)),
        weight: Number(((g.totalValue / currentValue) * 100).toFixed(2)),
        stockCount: g.stocks.length,
        stocks: g.stocks.sort((a, b) => b.value - a.value) // leader first (by value)
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    // Generate redundancy alerts and consolidation suggestions
    const redundancies = clusters.map(cluster => {
      // Leader = stock with highest value (most invested)
      const leader = cluster.stocks[0];
      const redundant = cluster.stocks.slice(1);
      const redundantValue = redundant.reduce((sum, s) => sum + s.value, 0);

      return {
        industry: cluster.industry,
        sector: cluster.sector,
        leader: {
          symbol: leader.symbol,
          companyName: leader.companyName,
          value: leader.value,
          returnPct: leader.returnPct,
          reason: "Largest position — keep as industry representative"
        },
        redundantStocks: redundant.map(s => ({
          symbol: s.symbol,
          companyName: s.companyName,
          value: s.value,
          returnPct: s.returnPct,
          action: `Consolidate into ${leader.symbol} or diversify`
        })),
        totalRedundantValue: Number(redundantValue.toFixed(2)),
        consolidationAdvice: `You hold ${cluster.stockCount} stocks in ${cluster.industry}. These are highly correlated — a downturn in this industry would hit all of them simultaneously. Consider consolidating into ${leader.symbol} (the leader) and diversifying ₹${Math.round(redundantValue).toLocaleString("en-IN")} into uncorrelated assets.`,
        riskExplanation: `Reducing redundancy protects you if ${cluster.industry} faces a regulatory or market downturn. Multiple positions in the same sub-industry amplify your downside risk without adding meaningful diversification.`
      };
    });

    const totalRedundantValue = redundancies.reduce((sum, r) => sum + r.totalRedundantValue, 0);

    // Pick best uncorrelated alternatives based on what's missing
    const presentSectors = new Set(Object.values(industryMap).map(i => i.sector));
    const suggestions = UNCORRELATED_ALTERNATIVES.map(alt => ({
      ...alt,
      allocateAmount: Number(((totalRedundantValue / UNCORRELATED_ALTERNATIVES.length) * (totalRedundantValue > 0 ? 1 : 0)).toFixed(2))
    }));

    // All unique industries (for the full map)
    const allIndustries = Object.values(industryGroups).map(g => ({
      industry: g.industry,
      sector: g.sector,
      stockCount: g.stocks.length,
      totalValue: Number(g.totalValue.toFixed(2)),
      weight: Number(((g.totalValue / currentValue) * 100).toFixed(2)),
      stocks: g.stocks,
      isCluster: g.stocks.length >= 2
    })).sort((a, b) => b.totalValue - a.totalValue);

    res.json({
      totalPortfolioValue: Number(currentValue.toFixed(2)),
      totalIndustries: allIndustries.length,
      clusterCount: clusters.length,
      totalRedundantValue: Number(totalRedundantValue.toFixed(2)),
      allIndustries,
      clusters,
      redundancies,
      suggestions
    });
  } catch (err) {
    console.error("Correlation audit error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
