const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    icon: { type: String, default: "📦" },
    color: { type: String, default: "#6b7280" },
    type: {
      type: String,
      enum: ["need", "want"],
      default: "want",
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
