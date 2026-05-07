const express = require("express");
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const { getStockCategory: getStockCategoryFromRanking, getCompanyName } = require("../utils/marketCapRanking");

const router = express.Router();

// Constants for correlation and sector analysis
const UNCORRELATED_SECTORS = [
  "Information Technology",
  "Health Care",
  "Consumer Staples",
  "Utilities",
  "Financials",
];

const ALL_SECTORS = [
  "Information Technology",
  "Health Care",
  "Consumer Staples",
  "Utilities",
  "Financials",
  "Energy",
  "Materials",
  "Industrials",
  "Consumer Discretionary",
  "Real Estate",
  "Communication Services",
];

// Map Yahoo Finance sector names to our standard ALL_SECTORS names
const SECTOR_NAME_MAP = {
  "Technology": "Information Technology",
  "Healthcare": "Health Care",
  "Financial Services": "Financials",
  "Consumer Defensive": "Consumer Staples",
  "Consumer Cyclical": "Consumer Discretionary",
  "Basic Materials": "Materials",
  "Communication Services": "Communication Services",
  "Energy": "Energy",
  "Utilities": "Utilities",
  "Industrials": "Industrials",
  "Real Estate": "Real Estate",
};

function normalizeSectorName(rawSector) {
  if (!rawSector) return "Other";
  // Direct match in our ALL_SECTORS
  if (ALL_SECTORS.includes(rawSector)) return rawSector;
  // Check the mapping
  if (SECTOR_NAME_MAP[rawSector]) return SECTOR_NAME_MAP[rawSector];
  return rawSector;
}

async function getVolatility(symbol) {
  try {
    const p1 = new Date();
    p1.setFullYear(p1.getFullYear() - 1);
    const p1Num = Math.floor(p1.getTime() / 1000);
    const p2Num = Math.floor(new Date().getTime() / 1000);
    const queryOptions = { period1: p1Num, period2: p2Num, interval: "1wk" };
    try {
      const chart = await yahooFinance.chart(symbol, queryOptions);
      const quotes = chart?.quotes;
      if (!quotes || quotes.length < 5) return 0.15;
      return calculateVolatilityFromHistory(quotes, symbol);
    } catch (fetchError) {
      return 0.15;
    }
  } catch (e) {
    return 0.15;
  }
}

function calculateVolatilityFromHistory(history, symbol) {
  const returns = [];
  for (let i = 1; i < history.length; i++) {
    if (history[i].close && history[i - 1].close) {
      returns.push((history[i].close - history[i - 1].close) / history[i - 1].close);
    }
  }
  if (returns.length === 0) return 0.15;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(history.length > 100 ? 252 : 52);
}

async function getBeta(symbol) {
  try {
    const summary = await yahooFinance.quoteSummary(symbol, { modules: ["defaultKeyStatistics"] });
    const beta = summary?.defaultKeyStatistics?.beta;
    return typeof beta === "number" ? beta : 1.0;
  } catch (e) {
    return 1.0;
  }
}

async function getStockSector(symbol) {
  try {
    const s = symbol.toUpperCase();
    // Use quoteSummary with assetProfile — quote() returns undefined sector for Indian stocks
    const summary = await yahooFinance.quoteSummary(s, { modules: ["assetProfile"] });
    const profile = summary?.assetProfile;
    if (!profile) return "Other";
    const rawSector = profile.sector || profile.industry || "Other";
    return normalizeSectorName(rawSector);
  } catch (e) {
    return "Other";
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

function getStockCategory(symbol) {
  return getStockCategoryFromRanking(symbol);
}

function formatHolding(h) {
  if (!h) return null;
  return {
    ...h,
    _id: h.id,
    userId: h.user_id,
    companyName: h.company_name,
    priceBoughtAt: h.price_bought_at,
    purchaseDate: h.purchase_date,
    lastPrice: h.last_price,
    lastFetched: h.last_fetched
  };
}

router.get("/stock-category/:symbol", authMiddleware, async (req, res) => {
  try {
    const { symbol } = req.params;
    const category = getStockCategory(symbol);
    const quote = await yahooFinance.quote(symbol);
    const companyName = quote?.longName || quote?.shortName || symbol;
    res.json({ category, companyName, symbol: symbol.toUpperCase() });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stock category" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const { symbol, quantity, priceBoughtAt, purchaseDate, category } = req.body;
  if (!symbol || !quantity || !priceBoughtAt || !purchaseDate)
    return res.status(400).json({ message: "Missing required fields" });

  try {
    const quote = await yahooFinance.quote(symbol);
    if (!quote) return res.status(404).json({ message: "Stock symbol not found" });

    let finalCategory = category || getStockCategory(symbol);
    const validCategories = ["Large Cap", "Mid Cap", "Small Cap", "Unclassified"];
    if (finalCategory && !validCategories.includes(finalCategory)) {
      return res.status(400).json({ message: "Invalid category." });
    }

    const { data: holding, error } = await supabase.from('portfolio_holdings').insert({
      user_id: req.userId,
      symbol: symbol.toUpperCase(),
      company_name: quote.longName || quote.shortName || symbol,
      quantity: Number(quantity),
      price_bought_at: Number(priceBoughtAt),
      purchase_date: purchaseDate,
      category: finalCategory,
      last_price: quote.regularMarketPrice,
      last_fetched: new Date().toISOString(),
    }).select().single();

    if (error) throw error;
    res.status(201).json(formatHolding(holding));
  } catch (err) {
    console.error("Add stock error:", err);
    res.status(500).json({ error: "Failed to fetch stock data. Details: " + err.message });
  }
});

async function getUpdatedHolding(holding, now = new Date()) {
  const isStale = !holding.last_fetched || (now - new Date(holding.last_fetched) > 15 * 60 * 1000);
  if (isStale) {
    try {
      const quote = await yahooFinance.quote(holding.symbol);
      if (quote && quote.regularMarketPrice !== undefined) {
        const updates = {
          last_price: quote.regularMarketPrice,
          last_fetched: now.toISOString()
        };
        if (quote.longName || quote.shortName) {
          updates.company_name = quote.longName || quote.shortName;
        }
        const { data } = await supabase.from('portfolio_holdings').update(updates).eq('id', holding.id).select().single();
        if (data) return data;
      }
    } catch (e) { }
  }
  return holding;
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { data: holdings, error } = await supabase.from('portfolio_holdings').select().eq('user_id', req.userId).order('symbol', { ascending: true });
    if (error) throw error;

    const now = new Date();
    const updated = await Promise.all((holdings || []).map(h => getUpdatedHolding(h, now)));
    res.json(updated.map(formatHolding));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  const { quantity, priceBoughtAt, purchaseDate, category } = req.body;
  try {
    const updates = {};
    if (quantity !== undefined) updates.quantity = Number(quantity);
    if (priceBoughtAt !== undefined) updates.price_bought_at = Number(priceBoughtAt);
    if (purchaseDate !== undefined) updates.purchase_date = purchaseDate;
    if (category !== undefined) updates.category = category;

    const { data: holding, error } = await supabase.from('portfolio_holdings').update(updates).eq('id', req.params.id).eq('user_id', req.userId).select().single();
    if (error || !holding) return res.status(404).json({ message: "Holding not found" });

    res.json(formatHolding(holding));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('portfolio_holdings').delete().eq('id', req.params.id).eq('user_id', req.userId);
    if (error) throw error;
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const { data: holdings } = await supabase.from('portfolio_holdings').select().eq('user_id', req.userId);
    const now = new Date();
    const updated = await Promise.all((holdings || []).map(h => getUpdatedHolding(h, now)));

    let totalInvested = 0, currentValue = 0;
    const categoryMap = {};
    const stockReturns = [];

    updated.forEach(h => {
      const invested = h.quantity * h.price_bought_at;
      const current = h.quantity * (h.last_price || h.price_bought_at);
      const pnl = current - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

      totalInvested += invested;
      currentValue += current;
      categoryMap[h.category] = (categoryMap[h.category] || 0) + current;
      stockReturns.push({
        symbol: h.symbol,
        returnPct: Number(pnlPct.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        value: Number(current.toFixed(2)),
        volatility: 0
      });
    });

    const categoryBreakdown = Object.entries(categoryMap).map(([name, total]) => ({ name, total: Number(total.toFixed(2)) }));
    const symbols = [...new Set(updated.map(h => h.symbol))];

    const volMap = {};
    await Promise.all(symbols.map(async (s) => volMap[s] = await getVolatility(s)));

    let weightedVolSum = 0;
    stockReturns.forEach(sr => {
      sr.volatility = Number((volMap[sr.symbol] * 100).toFixed(2));
      if (currentValue > 0) weightedVolSum += (volMap[sr.symbol] * (sr.value / currentValue));
    });
    stockReturns.sort((a, b) => b.returnPct - a.returnPct);

    const betaMap = {};
    await Promise.all(symbols.map(async (s) => betaMap[s] = await getBeta(s)));

    let weightedBetaSum = 0;
    stockReturns.forEach(sr => {
      sr.beta = Number((betaMap[sr.symbol] || 1.0).toFixed(2));
      if (currentValue > 0) weightedBetaSum += (betaMap[sr.symbol] || 1.0) * (sr.value / currentValue);
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
    res.status(500).json({ error: err.message });
  }
});

router.get("/suggestions", authMiddleware, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('investor_type').eq('id', req.userId).single();
    const investorType = user?.investor_type || "Moderate"
    const { data: holdings } = await supabase.from('portfolio_holdings').select().eq('user_id', req.userId);
    const now = new Date();
    const updated = await Promise.all((holdings || []).map(h => getUpdatedHolding(h, now)));
    const currentValue = updated.reduce((sum, h) => sum + (h.quantity * (h.last_price || h.price_bought_at)), 0);
    const categoryMap = {}; const categoryHoldings = {};
    updated.forEach(h => {
      const val = h.quantity * (h.last_price || h.price_bought_at);
      const invested = h.quantity * h.price_bought_at;
      const pnl = val - invested;
      const returnPct = invested > 0 ? (pnl / invested) * 100 : 0;
      categoryMap[h.category] = (categoryMap[h.category] || 0) + val;
      if (!categoryHoldings[h.category]) categoryHoldings[h.category] = [];
      categoryHoldings[h.category].push({
        symbol: h.symbol, companyName: h.company_name, value: Number(val.toFixed(2)), invested: Number(invested.toFixed(2)),
        pnl: Number(pnl.toFixed(2)), returnPct: Number(returnPct.toFixed(2)), quantity: h.quantity, lastPrice: h.last_price || h.price_bought_at
      });
    });
    const TARGETS = { Conservative: { "Large Cap": 60, "Mid Cap": 30, "Small Cap": 10 }, Moderate: { "Large Cap": 50, "Mid Cap": 35, "Small Cap": 15 }, Aggressive: { "Large Cap": 40, "Mid Cap": 40, "Small Cap": 20 } };
    const target = TARGETS[investorType];
    const categories = ["Large Cap", "Mid Cap", "Small Cap"];
    const analysis = categories.map(cat => {
      const currentVal = categoryMap[cat] || 0; const currentPct = currentValue > 0 ? (currentVal / currentValue) * 100 : 0;
      const targetPct = target[cat]; const targetVal = (targetPct / 100) * currentValue;
      const delta = currentPct - targetPct; const deltaAmount = currentVal - targetVal;
      let status = "On Track"; if (delta > 5) status = "Overweight"; else if (delta < -5) status = "Underweight";
      return { category: cat, currentPct: Number(currentPct.toFixed(2)), currentVal: Number(currentVal.toFixed(2)), targetPct: Number(targetPct.toFixed(2)), targetVal: Number(targetVal.toFixed(2)), delta: Number(delta.toFixed(2)), deltaAmount: Number(deltaAmount.toFixed(2)), status };
    });
    const rebalancePlan = []; const sellActions = []; const buyActions = [];
    const overweight = analysis.filter(a => a.status === "Overweight");
    const underweight = analysis.filter(a => a.status === "Underweight");
    overweight.forEach(ow => {
      const sellAmount = Math.abs(ow.deltaAmount);
      const stocks = (categoryHoldings[ow.category] || []).sort((a, b) => b.returnPct - a.returnPct);
      let remaining = sellAmount; const stockSells = [];
      for (const stock of stocks) {
        if (remaining <= 0) break;
        const sellFromThis = Math.min(remaining, stock.value * 0.6);
        const sellQty = Math.ceil(sellFromThis / stock.lastPrice);
        const actualSellAmount = sellQty * stock.lastPrice;
        stockSells.push({ symbol: stock.symbol, companyName: stock.companyName, sellQuantity: sellQty, sellAmount: Number(actualSellAmount.toFixed(2)), currentReturn: stock.returnPct, reason: stock.returnPct > 0 ? `Lock in ${stock.returnPct.toFixed(1)}% gains` : `Reduce exposure` });
        remaining -= actualSellAmount;
      }
      sellActions.push({ category: ow.category, totalSellAmount: Number(sellAmount.toFixed(2)), excessPct: ow.delta, stocks: stockSells });
      rebalancePlan.push({ action: "SELL", category: ow.category, amount: Number(sellAmount.toFixed(2)), fromPct: ow.currentPct, toPct: ow.targetPct, description: `Sell ₹${Math.round(sellAmount).toLocaleString("en-IN")} of ${ow.category}` });
    });
    const totalSellAmount = sellActions.reduce((sum, s) => sum + s.totalSellAmount, 0);
    underweight.forEach(uw => {
      const buyAmount = Math.abs(uw.deltaAmount);
      const allocatedBuy = totalSellAmount > 0 ? Math.min(buyAmount, totalSellAmount * (buyAmount / underweight.reduce((s, u) => s + Math.abs(u.deltaAmount), 0))) : buyAmount;
      buyActions.push({ category: uw.category, totalBuyAmount: Number(allocatedBuy.toFixed(2)), deficitPct: Math.abs(uw.delta), suggestion: `Add ${uw.category} stocks` });
      rebalancePlan.push({ action: "BUY", category: uw.category, amount: Number(allocatedBuy.toFixed(2)), fromPct: uw.currentPct, toPct: uw.targetPct, description: `Buy ₹${Math.round(allocatedBuy).toLocaleString("en-IN")} of ${uw.category}` });
    });
    res.json({ investorType, totalPortfolioValue: Number(currentValue.toFixed(2)), analysis, rebalancePlan, sellActions, buyActions, summary: rebalancePlan.map(r => r.description).join(" → ") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/risk-analysis", authMiddleware, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('investor_type').eq('id', req.userId).single();
    const investorType = user?.investor_type || "Moderate"
    const { data: holdings } = await supabase.from('portfolio_holdings').select().eq('user_id', req.userId);
    if (!holdings || holdings.length === 0) return res.json({ investorType, portfolioVolatility: 0, portfolioWeightedBeta: 0, targetBetaRange: { min: 0, max: 0 }, riskRating: "N/A", holdings: [], inconsistencies: [], rebalanceSuggestions: [], projectedBetaAfterRebalance: 0 });
    const now = new Date(); const updated = await Promise.all(holdings.map(h => getUpdatedHolding(h, now)));
    const currentValue = updated.reduce((sum, h) => sum + (h.quantity * (h.last_price || h.price_bought_at)), 0);
    const BETA_THRESHOLDS = { Conservative: 1.2, Moderate: 1.5, Aggressive: Infinity };
    const TARGET_BETA = { Conservative: { min: 0.5, max: 0.8 }, Moderate: { min: 0.8, max: 1.0 }, Aggressive: { min: 1.0, max: 1.5 } };
    const betaThreshold = BETA_THRESHOLDS[investorType] || 1.5; const targetRange = TARGET_BETA[investorType] || TARGET_BETA.Moderate;
    const symbols = [...new Set(updated.map(h => h.symbol))];
    const volMap = {}; const betaMap = {};
    await Promise.all(symbols.map(async (s) => { volMap[s] = await getVolatility(s); betaMap[s] = await getBeta(s); }));
    let weightedVolSum = 0; let weightedBetaSum = 0;
    const holdingAnalysis = updated.map(h => {
      const value = h.quantity * (h.last_price || h.price_bought_at); const weight = currentValue > 0 ? (value / currentValue) * 100 : 0;
      const beta = betaMap[h.symbol] || 1.0; const volatility = volMap[h.symbol] || 0.15;
      weightedVolSum += volatility * (value / currentValue); weightedBetaSum += beta * (value / currentValue);
      const flagged = beta > betaThreshold;
      return { symbol: h.symbol, companyName: h.company_name, category: h.category, weight: Number(weight.toFixed(2)), beta: Number(beta.toFixed(2)), volatility: Number((volatility * 100).toFixed(2)), value: Number(value.toFixed(2)), flagged, reason: flagged ? `Beta exceeds` : null };
    });
    let riskRating = "Low"; if (weightedBetaSum > targetRange.max + 0.3) riskRating = "High"; else if (weightedBetaSum > targetRange.max) riskRating = "Moderate";
    const inconsistencies = holdingAnalysis.filter(h => h.flagged); const rebalanceSuggestions = []; let totalTrimAmount = 0;
    if (inconsistencies.length > 0 && weightedBetaSum > targetRange.max) {
      const betaOvershoot = weightedBetaSum - targetRange.max;
      inconsistencies.forEach(h => {
        let trimPct = Math.round(Math.min(60, Math.max(15, ((h.beta - betaThreshold) / h.beta) * 100 + betaOvershoot * 20)));
        const trimAmount = Number(((h.value * trimPct) / 100).toFixed(2)); totalTrimAmount += trimAmount;
        h.suggestedTrimPct = trimPct; h.trimAmount = trimAmount;
        rebalanceSuggestions.push({ action: "TRIM", symbol: h.symbol, companyName: h.companyName, trimPct, amount: trimAmount, reason: h.reason });
      });
      rebalanceSuggestions.push({ action: "ALLOCATE", target: "Nifty 50 Index ETF", amount: Number((totalTrimAmount * 0.6).toFixed(2)), reason: "Low cost index" });
    }
    res.json({ investorType, portfolioVolatility: Number((weightedVolSum * 100).toFixed(2)), portfolioWeightedBeta: Number(weightedBetaSum.toFixed(2)), targetBetaRange: targetRange, riskRating, holdings: holdingAnalysis, inconsistencies, rebalanceSuggestions, projectedBetaAfterRebalance: weightedBetaSum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/sector-analysis", authMiddleware, async (req, res) => {
  try {
    const { data: holdings } = await supabase.from('portfolio_holdings').select().eq('user_id', req.userId);
    if (!holdings || holdings.length === 0) {
      return res.json({ sectorBreakdown: [], concentrationWarnings: [], missingSectors: ALL_SECTORS, diversificationScore: 0 });
    }

    const now = new Date();
    const updated = await Promise.all(holdings.map(h => getUpdatedHolding(h, now)));
    const totalValue = updated.reduce((sum, h) => sum + (h.quantity * (h.last_price || h.price_bought_at || 0)), 0);

    const sectorMap = {};
    for (const h of updated) {
      const sector = await getStockSector(h.symbol);
      const val = h.quantity * (h.last_price || h.price_bought_at || 0);
      const weight = totalValue > 0 ? (val / totalValue) * 100 : 0;

      if (!sectorMap[sector]) sectorMap[sector] = { sector, value: 0, holdings: [] };
      sectorMap[sector].value += val;
      sectorMap[sector].holdings.push({ symbol: h.symbol, weight: Number(weight.toFixed(1)) });
    }

    const sectorBreakdown = Object.values(sectorMap).map(s => ({
      ...s,
      percentage: Number(((s.value / totalValue) * 100).toFixed(1)),
      value: Number(s.value.toFixed(2))
    })).sort((a, b) => b.value - a.value);

    const concentrationWarnings = sectorBreakdown
      .filter(s => s.percentage > 30)
      .map(s => ({ sector: s.sector, percentage: s.percentage, severity: s.percentage > 50 ? "Critical" : "High" }));

    const missingSectors = ALL_SECTORS.filter(s => !sectorMap[s]);
    const coveredCount = sectorBreakdown.length;
    const diversificationScore = Math.min(100, Math.round((coveredCount / 11) * 60 + (concentrationWarnings.length === 0 ? 40 : 20)));

    let diversificationSuggestion = null;
    if (concentrationWarnings.length > 0 && missingSectors.length > 0) {
      const from = concentrationWarnings[0];
      const to = missingSectors[0];
      diversificationSuggestion = {
        fromSector: from.sector,
        toSector: to,
        shiftPercentage: Math.round(from.percentage - 25),
        shiftAmount: Number(((totalValue * (from.percentage - 25)) / 100).toFixed(2)),
        exampleStocks: ["Nifty 50 ETF", "Sector Fund"],
        reason: `Your portfolio is heavily concentrated in ${from.sector} (${from.percentage}%). Reallocating to ${to} will reduce systemic risk.`
      };
    }

    res.json({ sectorBreakdown, concentrationWarnings, missingSectors, diversificationScore, diversificationSuggestion, totalValue: Number(totalValue.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/correlation-audit", authMiddleware, async (req, res) => {
  try {
    const { data: holdings } = await supabase.from('portfolio_holdings').select().eq('user_id', req.userId);
    if (!holdings || holdings.length === 0) {
      return res.json({ clusterCount: 0, totalRedundantValue: 0, redundancies: [], totalIndustries: 0 });
    }

    const now = new Date();
    const updated = await Promise.all(holdings.map(h => getUpdatedHolding(h, now)));
    const totalValue = updated.reduce((sum, h) => sum + (h.quantity * (h.last_price || h.price_bought_at || 0)), 0);

    const industryMap = {};
    for (const h of updated) {
      let industry = "Other";
      let sector = "Other";
      try {
        const summary = await yahooFinance.quoteSummary(h.symbol, { modules: ["assetProfile"] });
        const profile = summary?.assetProfile;
        industry = profile?.industry || profile?.sector || "Other";
        sector = normalizeSectorName(profile?.sector);
      } catch (e) { /* fallback to Other */ }
      const val = h.quantity * (h.last_price || h.price_bought_at || 0);
      const invested = h.quantity * h.price_bought_at;
      const pnl = val - invested;
      const returnPct = invested > 0 ? (pnl / invested) * 100 : 0;

      if (!industryMap[industry]) industryMap[industry] = [];
      industryMap[industry].push({
        symbol: h.symbol,
        companyName: h.company_name,
        value: val,
        returnPct: Number(returnPct.toFixed(1)),
        sector
      });
    }

    const redundancies = [];
    let totalRedundantValue = 0;

    Object.entries(industryMap).forEach(([industry, stocks]) => {
      if (stocks.length > 1) {
        stocks.sort((a, b) => b.returnPct - a.returnPct);
        const leader = stocks[0];
        const redundant = stocks.slice(1);
        const redundantVal = redundant.reduce((sum, s) => sum + s.value, 0);
        totalRedundantValue += redundantVal;

        redundancies.push({
          industry,
          sector: stocks[0].sector,
          clusterCount: stocks.length,
          leader: { ...leader, reason: "Highest return in cluster", value: Number(leader.value.toFixed(2)) },
          redundantStocks: redundant.map(s => ({ ...s, value: Number(s.value.toFixed(2)), action: "Consider consolidating into leader or Nifty 50" })),
          consolidationAdvice: `You have ${stocks.length} stocks in ${industry}. They likely move in tandem.`,
          riskExplanation: "Industry clusters increase unsystematic risk. Consolidating into the leader reduces management overhead without losing exposure."
        });
      }
    });

    res.json({
      clusterCount: redundancies.length,
      totalRedundantValue: Number(totalRedundantValue.toFixed(2)),
      redundancies,
      totalIndustries: Object.keys(industryMap).length,
      suggestions: [
        { name: "Gold / Debt ETF", reason: "Negative correlation with equities", examples: ["GOLDBEES.NS", "LIQUIDBEES.NS"], allocateAmount: Number((totalRedundantValue * 0.4).toFixed(2)) },
        { name: "International Equities", reason: "Geographical diversification", examples: ["MON100.NS", "MAFANG.NS"], allocateAmount: Number((totalRedundantValue * 0.3).toFixed(2)) }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
