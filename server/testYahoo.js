const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

console.log("Testing yahoo-finance2...");
yahooFinance.quote("TCS.NS").then(q => {
    console.log("Quote received:", q.shortName, q.regularMarketPrice);
}).catch(err => {
    console.error("Quote failed:", err.message);
});
