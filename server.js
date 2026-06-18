// ============================================================
// KitchenPulse Backend — Node.js + Express
// Deploy this on Railway.app (free tier)
// ============================================================

import "dotenv/config";
import express from "express";
import cors from "cors";
import toggleRoutes from "./server/toggle/toggle.routes.js";
import timingRoutes from "./server/timing/timing.routes.js";
import reviewsRouter from "./server/reviews/reviewsRouter.js";
import automationRoutes from "./server/ratings/automation.routes.js";
import insightsRoutes from "./server/ratings/insights.routes.js";

const app = express();
app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── MOUNT MODULAR ROUTES ─────────────────────────────────────
app.use("/api", toggleRoutes);
app.use("/api", timingRoutes);
app.use("/api/reviews", reviewsRouter);
app.use("/api/automation", automationRoutes);
app.use("/api/insights", insightsRoutes);

// ─── START SERVER ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`KitchenPulse backend running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
