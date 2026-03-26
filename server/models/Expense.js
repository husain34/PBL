const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: { type: Number, required: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    date: { type: Date, required: true },
    note: { type: String, default: "" },
    paymentMode: {
      type: String,
      enum: ["Cash", "UPI", "Card", "Net Banking", "Other"],
      default: "UPI",
    },
    isRecurring: { type: Boolean, default: false },
    // 0 = indefinite, >0 = specific number of months remaining
    recurringMonthsLeft: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);