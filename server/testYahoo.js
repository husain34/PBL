const Yahoo = require("yahoo-finance2").default;
console.log("Type of Yahoo default export:", typeof Yahoo);
if (typeof Yahoo === 'function') {
    const yahooFinance = new Yahoo();
    console.log("Instance created. Testing quote...");
    yahooFinance.quote("TCS.NS").then(q => {
        console.log("Quote received:", q.shortName, q.regularMarketPrice);
    }).catch(err => {
        console.error("Quote failed:", err);
    });
} else {
    console.log("Yahoo is not a function. It is:", typeof Yahoo);
    console.log("Keys on default export:", Object.keys(Yahoo || {}));
}
