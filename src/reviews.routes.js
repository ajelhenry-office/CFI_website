import express from "express";

const router = express.Router();

// ─── GOOGLE DINE-IN REVIEWS ENDPOINTS ─────────────────────────

router.get("/reviews", async (req, res) => {
  res.json({ success: true, message: "Dine-in reviews route is active!" });
});

export default router;