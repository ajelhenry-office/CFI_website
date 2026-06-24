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
import { handleFilterRequest } from "./server/ratings/filters.js";
import { supabase } from "./server/ratings/supabaseClient.js";

const app = express();
app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "Backend is running" });
});

// ─── DB TEST ENDPOINT ─────────────────────────────────────────
app.get("/test-db", async (req, res) => {
  try {
    // If your table is actually named 'order_reviews', replace 'swiggy_ratings_feedback' below
    const { data, error } = await supabase
      .from('swiggy_ratings_feedback')
      .select('*')
      .limit(1);
      
    if (error) throw error;
    
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── MOUNT MODULAR ROUTES ─────────────────────────────────────
app.use("/api", toggleRoutes);
app.use("/api", timingRoutes);
app.use("/api/reviews", reviewsRouter);
app.use("/api/automation", automationRoutes);
app.use("/api/insights", insightsRoutes);

// New route for fetching filter dropdown options
app.get("/api/filters", handleFilterRequest);

// ─── START SERVER ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`KitchenPulse backend running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
