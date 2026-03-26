const mongoose = require("mongoose");

const incomeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: { type: Number, required: true },
    source: {
      type: String,
      enum: ["Salary", "Freelance", "Business", "Rental", "Other"],
      required: function () { return !this.isSalary; },
    },
    isSalary: { type: Boolean, default: false },
    frequency: {
      type: String,
      enum: ["One-time", "Monthly", "Weekly"],
      required: true,
    },
    date: { type: Date, required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Income", incomeSchema);