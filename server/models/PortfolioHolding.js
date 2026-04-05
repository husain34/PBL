const mongoose = require("mongoose");

const portfolioHoldingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    symbol: { type: String, required: true },
    companyName: { type: String, default: "" },
    quantity: { type: Number, required: true },
    avgPrice: { type: Number, required: true },
    purchaseDate: { type: Date, required: true },
    category: {
      type: String,
      enum: ["Large Cap", "Mid Cap", "Small Cap", "Debt", "Other"],
      required: true,
    },
    // Cached price data
    lastPrice: { type: Number, default: 0 },
    lastFetched: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PortfolioHolding", portfolioHoldingSchema);
