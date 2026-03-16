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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
